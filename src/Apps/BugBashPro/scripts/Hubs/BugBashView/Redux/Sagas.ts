import { WebApiTeam } from "azure-devops-extension-api/Core/Core";
import { WorkItem } from "azure-devops-extension-api/WorkItemTracking/WorkItemTracking";
import { IFilterState } from "azure-devops-ui/Utilities/Filter";
import { BugBashPortalActions } from "BugBashPro/Portals/BugBashPortal/Redux/Actions";
import { Resources } from "BugBashPro/Resources";
import { IBugBashItem, ISortState } from "BugBashPro/Shared/Contracts";
import { isBugBashItemAccepted } from "BugBashPro/Shared/Helpers";
import { BugBashesActions, BugBashesActionTypes } from "BugBashPro/Shared/Redux/BugBashes/Actions";
import { BugBashItemsActions, BugBashItemsActionTypes } from "BugBashPro/Shared/Redux/BugBashItems/Actions";
import { getAllBugBashItems, getBugBashItem, getResolvedWorkItemsMap } from "BugBashPro/Shared/Redux/BugBashItems/Selectors";
import { getTeamsMap } from "Common/AzDev/Teams/Redux/Selectors";
import { KeyValuePairActions } from "Common/Notifications/Redux/Actions";
import { ActionsOfType } from "Common/Redux";
import { addToast } from "Common/ServiceWrappers/GlobalMessageService";
import { openNewWindow } from "Common/ServiceWrappers/HostNavigationService";
import { openWorkItem } from "Common/ServiceWrappers/WorkItemNavigationService";
import { getWorkItemUrlAsync } from "Common/Utilities/UrlHelper";
import { Channel, channel, SagaIterator } from "redux-saga";
import { call, delay, put, race, select, take, takeEvery } from "redux-saga/effects";
import { BugBashViewPageErrorKey } from "../Constants";
import { getBugBashItemsFilterData, getFilteredBugBashItems } from "../Helpers";
import { BugBashViewActions, BugBashViewActionTypes } from "./Actions";
import { BugBashViewMode } from "./Contracts";
import { getBugBashItemsFilterState, getBugBashItemsSortState, getBugBashViewMode } from "./Selectors";

export function* bugBashViewSaga(): SagaIterator {
    yield takeEvery(BugBashViewActionTypes.Initialize, initializeView);
    yield takeEvery(BugBashViewActionTypes.SetViewMode, setViewMode);
    yield takeEvery(BugBashViewActionTypes.ApplyFilter, applyFilter);
    yield takeEvery(BugBashViewActionTypes.ApplySort, applySort);
    yield takeEvery(BugBashViewActionTypes.ClearSortAndFilter, clearSortAndFilter);
    yield takeEvery(BugBashViewActionTypes.EditBugBashItemRequested, editBugBashItemRequested);
    yield takeEvery(BugBashViewActionTypes.DismissBugBashItemPortalRequested, onBugBashItemPortalDismissed);

    yield takeEvery(BugBashesActionTypes.BugBashLoaded, bugBashLoaded);
    yield takeEvery(BugBashesActionTypes.BugBashUpdated, bugBashLoaded);

    yield takeEvery(BugBashItemsActionTypes.BugBashItemsLoaded, bugBashItemsLoaded);
    yield takeEvery(BugBashItemsActionTypes.BugBashItemDeleteFailed, bugBashItemDeleteFailed);
    yield takeEvery(BugBashItemsActionTypes.BugBashItemLoaded, bugBashItemLoadedOrCreatedOrUpdatedOrDeleted);
    yield takeEvery(BugBashItemsActionTypes.BugBashItemDeleted, bugBashItemLoadedOrCreatedOrUpdatedOrDeleted);
    yield takeEvery(BugBashItemsActionTypes.BugBashItemCreated, bugBashItemLoadedOrCreatedOrUpdatedOrDeleted);
    yield takeEvery(BugBashItemsActionTypes.BugBashItemUpdated, bugBashItemLoadedOrCreatedOrUpdatedOrDeleted);
}

function* initializeView(action: ActionsOfType<BugBashViewActions, BugBashViewActionTypes.Initialize>) {
    const { bugBashId, initialBugBashItemId } = action.payload;

    if (initialBugBashItemId) {
        const { bugBashItemsLoaded } = yield race({
            bugBashItemsLoaded: take(BugBashItemsActionTypes.BugBashItemsLoaded),
            bugBashLoadFailed: take(BugBashesActionTypes.BugBashLoadFailed)
        });

        if (bugBashItemsLoaded) {
            yield put(BugBashViewActions.editBugBashItemRequested(bugBashId, initialBugBashItemId));
        }
    }
}

function* bugBashLoaded(action: ActionsOfType<BugBashesActions, BugBashesActionTypes.BugBashLoaded | BugBashesActionTypes.BugBashUpdated>) {
    const bugBash = action.payload;

    if (bugBash.autoAccept) {
        const viewMode: BugBashViewMode = yield select(getBugBashViewMode);
        if (viewMode !== BugBashViewMode.Accepted) {
            yield put(BugBashViewActions.setViewMode(BugBashViewMode.Accepted));
        }
    }
}

function* setViewMode(action: ActionsOfType<BugBashViewActions, BugBashViewActionTypes.SetViewMode>): SagaIterator {
    const viewMode = action.payload;
    const allBugBashItems: IBugBashItem[] | undefined = yield select(getAllBugBashItems);
    const resolvedWorkItemsMap: { [id: number]: WorkItem } | undefined = yield select(getResolvedWorkItemsMap);
    const teamsMap: { [idOrName: string]: WebApiTeam } | undefined = yield select(getTeamsMap);
    const filterState: IFilterState | undefined = yield select(getBugBashItemsFilterState);
    const sortState: ISortState | undefined = yield select(getBugBashItemsSortState);
    const filteredBugBashItems = getFilteredBugBashItems(allBugBashItems, resolvedWorkItemsMap, teamsMap, viewMode, filterState, sortState);
    yield put(BugBashViewActions.setFilteredItems(filteredBugBashItems));
}

function* applyFilter(action: ActionsOfType<BugBashViewActions, BugBashViewActionTypes.ApplyFilter>): SagaIterator {
    const filterState = action.payload;
    const allBugBashItems: IBugBashItem[] | undefined = yield select(getAllBugBashItems);
    const resolvedWorkItemsMap: { [id: number]: WorkItem } | undefined = yield select(getResolvedWorkItemsMap);
    const teamsMap: { [idOrName: string]: WebApiTeam } | undefined = yield select(getTeamsMap);
    const viewMode: BugBashViewMode = yield select(getBugBashViewMode);
    const sortState: ISortState | undefined = yield select(getBugBashItemsSortState);
    const filteredBugBashItems = getFilteredBugBashItems(allBugBashItems, resolvedWorkItemsMap, teamsMap, viewMode, filterState, sortState);
    yield put(BugBashViewActions.setFilteredItems(filteredBugBashItems));
}

function* applySort(action: ActionsOfType<BugBashViewActions, BugBashViewActionTypes.ApplySort>): SagaIterator {
    const sortState = action.payload;
    const allBugBashItems: IBugBashItem[] | undefined = yield select(getAllBugBashItems);
    const resolvedWorkItemsMap: { [id: number]: WorkItem } | undefined = yield select(getResolvedWorkItemsMap);
    const teamsMap: { [idOrName: string]: WebApiTeam } | undefined = yield select(getTeamsMap);
    const filterState: IFilterState | undefined = yield select(getBugBashItemsFilterState);
    const viewMode: BugBashViewMode = yield select(getBugBashViewMode);
    const filteredBugBashItems = getFilteredBugBashItems(allBugBashItems, resolvedWorkItemsMap, teamsMap, viewMode, filterState, sortState);
    yield put(BugBashViewActions.setFilteredItems(filteredBugBashItems));
}

function* clearSortAndFilter(): SagaIterator {
    const allBugBashItems: IBugBashItem[] | undefined = yield select(getAllBugBashItems);
    const resolvedWorkItemsMap: { [id: number]: WorkItem } | undefined = yield select(getResolvedWorkItemsMap);
    const teamsMap: { [idOrName: string]: WebApiTeam } | undefined = yield select(getTeamsMap);
    const viewMode: BugBashViewMode = yield select(getBugBashViewMode);
    const filteredBugBashItems = getFilteredBugBashItems(allBugBashItems, resolvedWorkItemsMap, teamsMap, viewMode, undefined, undefined);
    yield put(BugBashViewActions.setFilteredItems(filteredBugBashItems));
}

function* bugBashItemDeleteFailed(action: ActionsOfType<BugBashItemsActions, BugBashItemsActionTypes.BugBashItemDeleteFailed>): SagaIterator {
    const { error } = action.payload;
    yield put(KeyValuePairActions.pushEntry(BugBashViewPageErrorKey, error));
}

function* bugBashItemsLoaded(action: ActionsOfType<BugBashItemsActions, BugBashItemsActionTypes.BugBashItemsLoaded>): SagaIterator {
    const { bugBashItems, resolvedWorkItems } = action.payload;
    const teamsMap: { [idOrName: string]: WebApiTeam } | undefined = yield select(getTeamsMap);
    const viewMode: BugBashViewMode = yield select(getBugBashViewMode);
    const filterState: IFilterState | undefined = yield select(getBugBashItemsFilterState);
    const sortState: ISortState | undefined = yield select(getBugBashItemsSortState);
    const filteredBugBashItems = getFilteredBugBashItems(bugBashItems, resolvedWorkItems, teamsMap, viewMode, filterState, sortState);
    yield put(BugBashViewActions.setFilteredItems(filteredBugBashItems));

    const filterData = getBugBashItemsFilterData(bugBashItems, resolvedWorkItems);
    yield put(BugBashViewActions.setFilterData(filterData));
}

function* bugBashItemLoadedOrCreatedOrUpdatedOrDeleted(): SagaIterator {
    const allBugBashItems: IBugBashItem[] | undefined = yield select(getAllBugBashItems);
    const resolvedWorkItemsMap: { [id: number]: WorkItem } | undefined = yield select(getResolvedWorkItemsMap);
    const teamsMap: { [idOrName: string]: WebApiTeam } | undefined = yield select(getTeamsMap);
    const viewMode: BugBashViewMode = yield select(getBugBashViewMode);
    const filterState: IFilterState | undefined = yield select(getBugBashItemsFilterState);
    const sortState: ISortState | undefined = yield select(getBugBashItemsSortState);
    const filteredBugBashItems = getFilteredBugBashItems(allBugBashItems, resolvedWorkItemsMap, teamsMap, viewMode, filterState, sortState);
    yield put(BugBashViewActions.setFilteredItems(filteredBugBashItems));

    const filterData = getBugBashItemsFilterData(allBugBashItems, resolvedWorkItemsMap);
    yield put(BugBashViewActions.setFilterData(filterData));
}

function* editBugBashItemRequested(action: ActionsOfType<BugBashViewActions, BugBashViewActionTypes.EditBugBashItemRequested>) {
    const { bugBashId, bugBashItemId } = action.payload;
    const bugBashItem: IBugBashItem | undefined = yield select(getBugBashItem, bugBashItemId);

    if (bugBashItem && isBugBashItemAccepted(bugBashItem)) {
        const workItem: WorkItem = yield call(openWorkItem, bugBashItem.workItemId!);
        yield put(BugBashItemsActions.bugBashItemUpdated(bugBashItem, workItem));
    } else {
        yield put(BugBashPortalActions.openBugBashItemPortal(bugBashId, bugBashItemId, { readFromCache: false }));
    }
}

function* onBugBashItemPortalDismissed(action: ActionsOfType<BugBashViewActions, BugBashViewActionTypes.DismissBugBashItemPortalRequested>) {
    const { bugBashId, bugBashItemId, workItemId } = action.payload;
    if (workItemId) {
        const workItemUrl: string = yield call(getWorkItemUrlAsync, workItemId);
        yield call(addToast, {
            message: Resources.BugBashAcceptedCreatedMessage,
            callToAction: Resources.View,
            duration: 5000,
            forceOverrideExisting: true,
            onCallToActionClick: () => {
                openNewWindow(workItemUrl);
            }
        });
        yield put(BugBashPortalActions.dismissPortal());
    } else {
        const callbackChannel: Channel<BugBashPortalActions> = yield call(channel);
        const callback = () => {
            callbackChannel.put(BugBashPortalActions.openBugBashItemPortal(bugBashId, bugBashItemId, { readFromCache: true }));
        };

        yield call(addToast, {
            message: Resources.BugBashItemCreatedMessage,
            callToAction: Resources.View,
            duration: 5000,
            forceOverrideExisting: true,
            onCallToActionClick: callback
        });
        yield put(BugBashPortalActions.dismissPortal());

        const { message } = yield race({
            message: take(callbackChannel),
            timeout: delay(5000)
        });

        if (message) {
            yield put(message);
        }
        yield call([callbackChannel, callbackChannel.close]);
    }
}
