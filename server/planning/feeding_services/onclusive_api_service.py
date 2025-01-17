import time
import logging
import requests

from typing import Optional
from datetime import timedelta
from flask import current_app as app, json
from flask_babel import lazy_gettext
from superdesk.io.registry import register_feeding_service_parser
from superdesk.io.feeding_services.http_base_service import HTTPFeedingServiceBase
from superdesk.timer import timer
from superdesk.utc import utcnow
from urllib.parse import urljoin

logger = logging.getLogger(__name__)

REFRESH_TOKEN_KEY = "refreshToken"


class OnclusiveApiService(HTTPFeedingServiceBase):
    """
    Feeding Service class which can read events using HTTP
    """

    NAME = "onclusive_api"
    label = "Onclusive api feed"
    service = "events"
    FeedParser = "onclusive_api"
    fields = [
        {
            "id": "url",
            "type": "text",
            "label": "Feed URL",
            "placeholder": "Feed URL",
            "required": True,
            "default": "https://api.forwardplanner.com/",
        },
        {
            "id": "username",
            "type": "text",
            "label": lazy_gettext("Username"),
            "placeholder": lazy_gettext("Username"),
            "required": True,
        },
        {
            "id": "password",
            "type": "password",
            "label": lazy_gettext("Password"),
            "placeholder": lazy_gettext("Password"),
            "required": True,
        },
        {
            "id": "days_to_ingest",
            "type": "text",
            "label": lazy_gettext("Days to Ingest"),
            "placeholder": lazy_gettext("Days"),
            "required": False,
            "default": 365,
        },
    ]

    HTTP_AUTH = False
    timeout = (5, 60)

    def _update(self, provider, update):
        """
        Fetch events from external API.

        :param provider: Ingest Provider Details.
        :type provider: dict
        :param update: Any update that is required on provider.
        :type update: dict
        :return: a list of events which can be saved.
        """
        URL = provider["config"]["url"]
        LIMIT = 100
        MAX_OFFSET = int(app.config.get("ONCLUSIVE_MAX_OFFSET", 100000))
        self.session = requests.Session()
        parser = self.get_feed_parser(provider)
        update["tokens"] = provider.get("tokens") or {}
        start_time = time.time()
        with timer("onclusive:update"):
            self.authenticate(provider, update["tokens"])
            if not self.token:
                return
            update["last_updated"] = utcnow().replace(
                second=0
            )  # next time start from here, onclusive api does not use seconds
            if update["tokens"].get("import_finished"):
                logger.info("Fetching updates since %s", provider["last_updated"].isoformat())
                url = urljoin(URL, "/api/v2/events/latest")
                start = update["tokens"]["import_finished"]
                start_offset = 0
                params = dict(
                    date=start.strftime("%Y%m%d"),
                    time=start.strftime("%H%M"),
                    limit=LIMIT,
                )
            else:
                days = int(provider["config"].get("days_to_ingest") or 365)
                logger.info("Fetching %d days", days)
                url = urljoin(URL, "/api/v2/events/between")
                start = update["tokens"].get("start_date") or update["last_updated"]
                update["tokens"]["start_date"] = start  # store for next time
                end = start + timedelta(days=days)
                start_offset = (
                    update["tokens"].get("start_offset") or 0
                )  # allow to continue in case this won't fininsh in single run
                if start_offset:
                    logger.info("Continuing from %d", start_offset)
                params = dict(
                    startDate=start.strftime("%Y%m%d"),
                    endDate=end.strftime("%Y%m%d"),
                    limit=LIMIT,
                )
            for offset in range(start_offset, MAX_OFFSET, LIMIT):
                if time.time() - start_time > 60 * 20:  # stop after 20m to avoid celery soft timeout
                    logger.warning("Stopping Onclusive ingest before the limit")
                    update["tokens"]["start_offset"] = offset
                    break
                params["offset"] = offset
                logger.debug("params %s", params)
                content = self._fetch(url, params, provider, update["tokens"])
                if not content:
                    logger.info("done ingesting with offset %d", offset)
                    break
                yield parser.parse(content, provider)
                update["tokens"]["start_offset"] = offset
            else:
                logger.warning("some items were not fetched due to the limit")
            update["tokens"]["import_finished"] = update["last_updated"]

    def _fetch(self, url, params, provider, tokens):
        with timer("onclusive:events"):
            response = self.session.get(url=url, params=params, headers=self.headers, timeout=self.timeout)

        if response.status_code == 401:
            self.authenticate(provider, tokens)
            if self.token:
                with timer("onclusive:events"):
                    response = self.session.get(url, params=params, headers=self.headers, timeout=self.timeout)

        response.raise_for_status()
        data = response.json()

        if data and app.config.get("ONCLUSIVE_DEBUG"):
            with open("/tmp/onclusive.json", "w") as f:
                json.dump(data, f, indent=2)

        return data

    @property
    def headers(self):
        assert self.token, "Missing auth token"
        return {"Content-Type": "application/json", "Authorization": "Bearer {}".format(self.token)}

    def authenticate(self, provider, tokens):
        self.token = None
        if tokens.get(REFRESH_TOKEN_KEY):
            self.renew_token(provider, tokens)
            if self.token:
                return self.token
        self.credentials(provider, tokens)
        return self.token

    def credentials(self, provider, tokens) -> Optional[str]:
        auth_url = urljoin(provider["config"]["url"], "/api/v2/auth")
        body = {"username": provider["config"]["username"], "password": provider["config"]["password"]}
        with timer("onclusive:auth"):
            resp = self.session.post(auth_url, body, timeout=self.timeout)
        resp.raise_for_status()
        data = resp.json()
        if data.get("refreshToken"):
            tokens[REFRESH_TOKEN_KEY] = data["refreshToken"]
        if data.get("token"):
            self.token = data["token"]
            return self.token
        logger.error("Could not authenticate using username and password")
        return None

    def renew_token(self, provider, tokens):
        url = urljoin(provider["config"]["url"], "/api/v2/auth/renew")
        body = {"refreshToken": tokens[REFRESH_TOKEN_KEY]}
        with timer("onclusive:auth-renew"):
            renew_response = self.session.post(url=url, data=body, timeout=self.timeout)
        try:
            renew_response.raise_for_status()
        except Exception as e:
            logger.error("error %s body %s", e, renew_response.content)
        if renew_response.status_code == 400:
            tokens[REFRESH_TOKEN_KEY] = None
            return
        if renew_response.status_code == 200:
            new_token = renew_response.json()
            if new_token.get("refreshToken"):
                tokens[REFRESH_TOKEN_KEY] = new_token["refreshToken"]
            self.token = new_token["token"]
            return self.token


register_feeding_service_parser(OnclusiveApiService.NAME, OnclusiveApiService.FeedParser)
