import { WorkItemTemplate, WorkItemTemplateReference } from "azure-devops-extension-api/WorkItemTracking/WorkItemTracking";
import { LoadStatus } from "Common/Contracts";
import { ActionsOfType } from "Common/Redux";
import { SagaIterator } from "redux-saga";
import { call, put, select, takeEvery } from "redux-saga/effects";
import { TeamTemplateActionTypes, TeamTemplatesActions, WorkItemTemplateActions, WorkItemTemplateActionTypes } from "./Actions";
import { fetchTeamTemplates, fetchTemplate } from "./DataSource";
import { getTeamTemplatesStatus, getTemplateStatus } from "./Selectors";

export function* workItemTemplatesSaga(): SagaIterator {
    yield takeEvery(TeamTemplateActionTypes.LoadRequested, loadTeamTemplates);
    yield takeEvery(WorkItemTemplateActionTypes.LoadRequested, loadWorkItemTemplate);
}

function* loadTeamTemplates(action: ActionsOfType<TeamTemplatesActions, TeamTemplateActionTypes.LoadRequested>): SagaIterator {
    const teamId = action.payload;
    const status: LoadStatus = yield select(getTeamTemplatesStatus, teamId);
    if (status === LoadStatus.NotLoaded) {
        yield put(TeamTemplatesActions.beginLoad(teamId));
        try {
            const data: WorkItemTemplateReference[] = yield call(fetchTeamTemplates, teamId);
            yield put(TeamTemplatesActions.loadSucceeded(teamId, data));
        } catch (error) {
            yield put(TeamTemplatesActions.loadFailed(teamId, error.message || error));
        }
    }
}

function* loadWorkItemTemplate(action: ActionsOfType<WorkItemTemplateActions, WorkItemTemplateActionTypes.LoadRequested>): SagaIterator {
    const { teamId, templateId } = action.payload;
    const status: LoadStatus = yield select(getTemplateStatus, templateId);

    if (status === LoadStatus.NotLoaded) {
        yield put(WorkItemTemplateActions.beginLoad(templateId));
        try {
            const data: WorkItemTemplate = yield call(fetchTemplate, teamId, templateId);
            yield put(WorkItemTemplateActions.loadSucceeded(data));
        } catch (error) {
            yield put(WorkItemTemplateActions.loadFailed(templateId, error.message || error));
        }
    }
}
