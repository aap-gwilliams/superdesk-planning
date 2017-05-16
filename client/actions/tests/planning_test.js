import sinon from 'sinon'
import * as actions from '../planning'
import { PRIVILEGES } from '../../constants'

describe('planning', () => {
    describe('actions', () => {
        let plannings = [
            {
                _id: 'p1',
                slugline: 'Planning1',
                headline: 'Some Plan 1',
            },
            {
                _id: 'p2',
                slugline: 'Planning2',
                headline: 'Some Plan 2',
            },
        ]

        let agendas = [
            {
                _id: 'a1',
                name: 'TestAgenda',
                planning_type: 'agenda',
            },
            {
                _id: 'a2',
                name: 'TestAgenda2',
                planning_type: 'agenda',
                planning_items: [plannings[1]._id],
            },
        ]

        let initialState

        const getState = () => (initialState)
        const dispatch = sinon.spy((action) =>  {
            if (typeof action === 'function') {
                return action(dispatch, getState, {
                    notify,
                    api,
                    $timeout,
                })
            }
        })
        const notify = {
            error: sinon.spy(),
            success: sinon.spy(),
        }
        const $timeout = sinon.spy((func) => func())

        let apiSpy = {
            query: sinon.spy(() => (Promise.resolve())),
            remove: sinon.spy(() => (Promise.resolve())),
            save: sinon.spy((ori, item) => (Promise.resolve({
                _id: 'p3',
                ...ori,
                ...item,
            }))),
        }

        let api

        beforeEach(() => {
            apiSpy.save.reset()
            apiSpy.query.reset()
            apiSpy.remove.reset()
            notify.error.reset()
            notify.success.reset()
            dispatch.reset()
            $timeout.reset()

            api = () => (apiSpy)

            initialState = {
                agenda: {
                    agendas,
                    currentAgendaId: agendas[1]._id,
                },
                planning: {
                    plannings,
                    currentPlanningId: plannings[1]._id,
                    editorOpened: false,
                    planningsAreLoading: false,
                    onlyFuture: true,
                    onlyActive: false,
                },
                privileges: {
                    planning: 1,
                    planning_planning_management: 1,
                    planning_planning_spike: 1,
                    planning_planning_unspike: 1,
                },
            }
        })

        describe('spikePlanning', () => {
            const action = actions.spikePlanning(plannings[1])

            it('spikePlanning calls `planning_spike` endpoint', () => {
                initialState.privileges.planning_planning_spike = 1
                api.update = sinon.spy(() => (Promise.resolve()))

                return action(dispatch, getState, {
                    api,
                    notify,
                    $timeout,
                })
                .then(() => {
                    expect(api.update.args[0]).toEqual([
                        'planning_spike',
                        plannings[1],
                        {},
                    ])
                    expect(notify.success.args[0]).toEqual(['The Planning Item has been spiked.'])
                    expect(dispatch.args[0]).toEqual([{
                        type: 'SPIKE_PLANNING',
                        payload: plannings[1],
                    }])

                    expect(dispatch.callCount).toBe(2)
                    expect($timeout.callCount).toBe(0)
                    expect(notify.error.callCount).toBe(0)
                })
            })

            it('spikePlanning raises ACCESS_DENIED without permission', () => {
                initialState.privileges.planning_planning_spike = 0
                return action(dispatch, getState, {
                    api,
                    notify,
                    $timeout,
                })
                .then(() => {
                    expect($timeout.callCount).toBe(1)
                    expect(notify.error.args[0]).toEqual(['Unauthorised to spike a planning item!'])
                    expect(dispatch.args[0]).toEqual([{
                        type: PRIVILEGES.ACTIONS.ACCESS_DENIED,
                        payload: {
                            action: '_spikePlanning',
                            permission: PRIVILEGES.SPIKE_PLANNING,
                            errorMessage: 'Unauthorised to spike a planning item!',
                            args: [plannings[1]],
                        },
                    }])
                    expect(dispatch.callCount).toBe(1)
                })
            })
        })

        describe('unspikePlanning', () => {
            const action = actions.unspikePlanning(plannings[1])

            it('unspikePlanning calls `planning_unspike` endpoint', () => {
                initialState.privileges.planning_planning_unspike = 1
                api.update = sinon.spy(() => (Promise.resolve()))

                return action(dispatch, getState, {
                    api,
                    notify,
                    $timeout,
                })
                .then(() => {
                    expect(api.update.args[0]).toEqual([
                        'planning_unspike',
                        plannings[1],
                        {},
                    ])

                    expect(notify.success.args[0]).toEqual(['The Planning Item has been unspiked.'])

                    expect(dispatch.args[1]).toEqual([{
                        type: 'UNSPIKE_PLANNING',
                        payload: plannings[1],
                    }])

                    expect(dispatch.callCount).toBe(2)
                    expect($timeout.callCount).toBe(0)
                    expect(notify.error.callCount).toBe(0)
                    expect(1).toBe(2)
                })
            })

            it('unspikePlanning raises ACCESS_DENIED without permission', () => {
                initialState.privileges.planning_planning_unspike = 0
                return action(dispatch, getState, {
                    api,
                    notify,
                    $timeout,
                })
                .then(() => {
                    expect($timeout.callCount).toBe(1)
                    expect(notify.error.args[0]).toEqual([
                        'Unauthorised to unspike a planning item!',
                    ])
                    expect(dispatch.args[0]).toEqual([{
                        type: PRIVILEGES.ACTIONS.ACCESS_DENIED,
                        payload: {
                            action: '_unspikePlanning',
                            permission: PRIVILEGES.UNSPIKE_PLANNING,
                            errorMessage: 'Unauthorised to unspike a planning item!',
                            args: [plannings[1]],
                        },
                    }])
                    expect(dispatch.callCount).toBe(1)
                })
            })
        })

        describe('savePlanning', () => {
            const item = { slugline: 'TestAgenda3' }
            const action = actions.savePlanning(item)

            it('savePlanning saves and executes dispatches', () => (
                action(dispatch, getState, {
                    notify,
                    $timeout,
                    api,
                })
                .then(() => {
                    expect(apiSpy.save.args[0]).toEqual([{}, item])
                    expect(notify.success.args[0]).toEqual(['The planning has been saved'])

                    // Cannot check dispatch(saveAndDeleteCoverages()) using a spy on dispatch
                    // As saveAndDeleteCoverages is a thunk function

                    expect($timeout.callCount).toBe(0)
                    expect(notify.error.callCount).toBe(0)
                })
            ))

            it('savePlanning raises ACCESS_DENIED without permission', () => {
                initialState.privileges.planning_planning_management = 0
                return action(dispatch, getState, {
                    notify,
                    $timeout,
                    api,
                })
                .then(() => {
                    expect($timeout.callCount).toBe(1)
                    expect(notify.error.args[0][0]).toBe('Unauthorised to modify a planning item!')
                    expect(dispatch.args[0]).toEqual([{
                        type: PRIVILEGES.ACTIONS.ACCESS_DENIED,
                        payload: {
                            action: '_savePlanning',
                            permission: PRIVILEGES.PLANNING_MANAGEMENT,
                            errorMessage: 'Unauthorised to modify a planning item!',
                            args: [item],
                        },
                    }])
                    expect(dispatch.callCount).toBe(1)
                })
            })
        })

        describe('savePlanningAndReloadCurrentAgenda', () => {
            const item = { slugline: 'TestAgenda3' }
            const action = actions.savePlanningAndReloadCurrentAgenda(item)

            it('savePlanningAndReloadCurrentAgenda saves and executes dispatches', () => (
                action(dispatch, getState, {
                    notify,
                    $timeout,
                    api,
                })
                .then(() => {
                    expect(dispatch.callCount).toBe(3)
                    // Cannot check dispatch(savePlanning()) using a spy on dispatch
                    // As savePlanning is a thunk function

                    // Cannot check dispatch(addToCurrentAgenda()) using a spy on dispatch
                    // As addToCurrentAgenda is a thunk function

                    // Cannot check dispatch(fetchSelectedAgendaPlannings()) using a spy on dispatch
                    // As fetchSelectedAgendaPlannings is a thunk function
                    expect($timeout.callCount).toBe(0)
                    expect(notify.error.callCount).toBe(0)
                })
            ))

            it('savePlanningAndReloadCurrentAgenda raises ACCESS_DENIED without permission', () => {
                initialState.privileges.planning_planning_management = 0
                return action(dispatch, getState, {
                    notify,
                    $timeout,
                    api,
                })
                .then(() => {
                    expect($timeout.callCount).toBe(1)
                    expect(notify.error.args[0][0]).toBe(
                        'Unauthorised to create a new planning item!'
                    )
                    expect(dispatch.args[0]).toEqual([{
                        type: PRIVILEGES.ACTIONS.ACCESS_DENIED,
                        payload: {
                            action: '_savePlanningAndReloadCurrentAgenda',
                            permission: PRIVILEGES.PLANNING_MANAGEMENT,
                            errorMessage: 'Unauthorised to create a new planning item!',
                            args: [item],
                        },
                    }])
                    expect(dispatch.callCount).toBe(1)
                })
            })

            it('savePlanningAndReloadCurrentAgenda fails if no Agenda is selected', () => {
                initialState.agenda.currentAgendaId = null
                return action(dispatch, getState, {
                    notify,
                    $timeout,
                    api,
                })
                .then(() => {
                    expect(notify.error.args[0]).toEqual(['No Agenda is currently selected.'])
                })
            })

            it('savePlanningAndReloadCurrentAgenda fails if current Agenda is spiked', () => {
                initialState.agenda.currentAgendaId = agendas[0]._id
                initialState.agenda.agendas[0].state = 'spiked'
                return action(dispatch, getState, {
                    notify,
                    $timeout,
                    api,
                })
                .then(() => {
                    expect(notify.error.args[0]).toEqual([
                        'Cannot create a new planning item in a spiked Agenda.',
                    ])
                })
            })
        })

        it('fetchPlannings', () => {
            const action = actions.fetchPlannings({})
            return action(dispatch, getState)
            .then(() => {
                expect(dispatch.args[0]).toEqual([{ type: 'REQUEST_PLANINGS' }])

                // Cannot check dispatch(performFetchRequest()) using a spy on dispatch
                // As performFetchRequest is a thunk function

                // Cannot check dispatch(silentlyFetchEventsById()) using a spy on dispatch
                // As silentlyFetchEventsById is a thunk function

                expect(dispatch.args[3]).toEqual([{
                    type: 'RECEIVE_PLANNINGS',
                    payload: plannings,
                }])

                expect(dispatch.callCount).toBe(4)
            })
        })

        describe('openPlanningEditor', () => {
            const action = actions.openPlanningEditor(plannings[0]._id)

            it('openPlanningEditor dispatches action', () => {
                action(dispatch, getState, {
                    notify,
                    $timeout,
                })
                expect(dispatch.args[0]).toEqual([{
                    type: 'OPEN_PLANNING_EDITOR',
                    payload: plannings[0]._id,
                }])
                expect($timeout.callCount).toBe(0)
                expect(notify.error.callCount).toBe(0)
                expect(dispatch.callCount).toBe(1)
            })

            it('openPlanningEditor raises ACCESS_DENIED without permission', () => {
                initialState.privileges.planning_planning_management = 0
                action(dispatch, getState, {
                    notify,
                    $timeout,
                })
                expect($timeout.callCount).toBe(1)
                expect(notify.error.args[0][0]).toBe('Unauthorised to edit a planning item!')
                expect(dispatch.args[0]).toEqual([{
                    type: PRIVILEGES.ACTIONS.ACCESS_DENIED,
                    payload: {
                        action: '_openPlanningEditor',
                        permission: PRIVILEGES.PLANNING_MANAGEMENT,
                        errorMessage: 'Unauthorised to edit a planning item!',
                        args: [plannings[0]._id],
                    },
                }])
                expect(dispatch.callCount).toBe(1)
            })
        })

        it('closePlanningEditor', () => {
            const action = actions.closePlanningEditor()
            expect(action).toEqual({ type: 'CLOSE_PLANNING_EDITOR' })
        })

        describe('openPlanningEditorAndAgenda', () => {
            const action = actions.openPlanningEditorAndAgenda(plannings[0]._id)

            it('openPlanningEditorAndAgenda dispatches actions', () => (
                action(dispatch, getState, {
                    notify,
                    $timeout,
                })
                .then(() => {
                    // Cannot check dispatch(openPlanningEditor()) using a spy on dispatch
                    // As openPlanningEditor is a thunk function

                    expect($timeout.callCount).toBe(0)
                    expect(notify.error.callCount).toBe(0)
                })
            ))

            it('openPlanningEditorAndAgenda raises ACCESS_DENIED without permission', () => {
                initialState.privileges.planning_planning_management = 0
                return action(dispatch, getState, {
                    notify,
                    $timeout,
                })
                .then(() => {
                    expect($timeout.callCount).toBe(1)
                    expect(notify.error.args[0][0]).toBe('Unauthorised to edit a planning item!')
                    expect(dispatch.args[0]).toEqual([{
                        type: PRIVILEGES.ACTIONS.ACCESS_DENIED,
                        payload: {
                            action: '_openPlanningEditorAndAgenda',
                            permission: PRIVILEGES.PLANNING_MANAGEMENT,
                            errorMessage: 'Unauthorised to edit a planning item!',
                            args: [plannings[0]._id],
                        },
                    }])
                    expect(dispatch.callCount).toBe(1)
                })
            })
        })

        it('toggleOnlyFutureFilter', () => {
            const action = actions.toggleOnlyFutureFilter()
            return action(dispatch, getState)
            .then(() => {
                expect(dispatch.args[0]).toEqual([{
                    type: 'SET_ONLY_FUTURE',
                    payload: false,
                }])

                expect(dispatch.callCount).toBe(1)
            })
        })

        it('toggleOnlySpikedFilter', () => {
            const action = actions.toggleOnlySpikedFilter()
            return action(dispatch, getState)
            .then(() => {
                expect(dispatch.args[0]).toEqual([{
                    type: 'SET_ONLY_SPIKED',
                    payload: true,
                }])

                expect(dispatch.callCount).toBe(1)
            })
        })

        it('planningFilterByKeyword', () => {
            const action = actions.planningFilterByKeyword('Find this plan ')
            expect(action).toEqual({
                type: 'PLANNING_FILTER_BY_KEYWORD',
                payload: 'Find this plan',
            })
        })
    })
})