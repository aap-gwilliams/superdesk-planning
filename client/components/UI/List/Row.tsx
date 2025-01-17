import React from 'react';
import PropTypes from 'prop-types';
import classNames from 'classnames';

/**
 * @ngdoc react
 * @name Row
 * @description Row Component in a list of item where each item is a row
 */
export const Row = ({children, classes, paddingBottom, testId}) => (
    <div
        className={classNames(
            'sd-list-item__row',
            classes,
            {
                'sd-list-item__row--padding-b5': paddingBottom,
            }
        )}
        data-test-id={testId}
    >
        {children}
    </div>
);

Row.propTypes = {
    children: PropTypes.node.isRequired,
    classes: PropTypes.string,
    margin: PropTypes.bool,
    marginTop: PropTypes.bool,
    paddingBottom: PropTypes.bool,
    testId: PropTypes.string,
};

Row.defaultProps = {
    classes: '',
    margin: true,
    marginTop: false,
};
