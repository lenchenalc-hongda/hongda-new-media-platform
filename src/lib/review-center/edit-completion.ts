import type { EditorMutationState } from './editor';
import type { AssignmentsSaveState } from './assignments-editor';
import type { MetadataEditorSaveState } from './metadata-editor';

export type EditCompletionModule =
  | 'basic'
  | 'metadata'
  | 'typeDetails'
  | 'assignments'
  | 'members';

const MODULE_LABELS: Record<EditCompletionModule, string> = {
  basic: '基础信息',
  metadata: '项目分类',
  typeDetails: '专项复盘内容',
  assignments: '项目负责人',
  members: '项目成员',
};

export type MemberMutationState =
  | 'idle'
  | 'saving'
  | 'stale_candidate'
  | 'duplicate'
  | 'validation'
  | 'error';

export interface EditCompletionInput {
  basicDirty: boolean;
  metadataDirty: boolean;
  typeDetailsDirty: boolean;
  assignmentsDirty: boolean;
  basicSaveState: EditorMutationState;
  metadataSaveState: MetadataEditorSaveState;
  typeDetailsSaveState: EditorMutationState;
  assignmentsSaveState: AssignmentsSaveState;
  memberMutationState: MemberMutationState;
  blocked: boolean;
}

export interface EditCompletionState {
  hasUnsavedChanges: boolean;
  hasPendingMutation: boolean;
  unsavedModules: string[];
  pendingModules: string[];
  blockedModules: string[];
  canFinishEditing: boolean;
  statusText: string;
  shouldWarnBeforeUnload: boolean;
}

function isSaving(state: string): boolean {
  return state === 'saving';
}

function isBlockedState(state: string): boolean {
  return state !== 'idle' && state !== 'saving' && state !== 'saved';
}

function blockedModuleMessage(module: EditCompletionModule, state: string): string {
  const label = MODULE_LABELS[module];
  if (state === 'validation') return `${label}：内容校验未通过`;
  if (state === 'error') return `${label}：保存失败`;
  if (state === 'conflict') return `${label}：数据已被其他人更新`;
  if (state === 'reload_required') return `${label}：需要重新加载最新数据`;
  if (state === 'non_editable') return `${label}：当前不可编辑`;
  if (state === 'forbidden') return `${label}：无权保存`;
  if (state === 'stale_candidate') return `${label}：候选人信息已变化`;
  if (state === 'duplicate') return `${label}：存在重复成员`;
  if (state === 'invalid_member') return `${label}：成员选项无效，需要重新加载`;
  return `${label}：存在未处理状态`;
}

export function getEditCompletionState(
  input: EditCompletionInput,
): EditCompletionState {
  const dirty = [
    ['basic', input.basicDirty],
    ['metadata', input.metadataDirty],
    ['typeDetails', input.typeDetailsDirty],
    ['assignments', input.assignmentsDirty],
  ] as const;
  const unsavedModules = dirty
    .filter(([, isDirty]) => isDirty)
    .map(([module]) => MODULE_LABELS[module]);

  const pendingModules: string[] = [];
  const blockedModules: string[] = [];

  for (const [module, state] of [
    ['basic', input.basicSaveState],
    ['metadata', input.metadataSaveState],
    ['typeDetails', input.typeDetailsSaveState],
    ['assignments', input.assignmentsSaveState],
  ] as const) {
    if (isSaving(state)) {
      pendingModules.push(MODULE_LABELS[module]);
    } else if (isBlockedState(state)) {
      blockedModules.push(blockedModuleMessage(module, state));
    }
  }

  if (isSaving(input.memberMutationState)) {
    pendingModules.push(MODULE_LABELS.members);
  } else if (isBlockedState(input.memberMutationState)) {
    blockedModules.push(blockedModuleMessage('members', input.memberMutationState));
  }

  const hasUnsavedChanges = unsavedModules.length > 0;
  const hasPendingMutation = pendingModules.length > 0;
  const hasBlockedModules = blockedModules.length > 0 || input.blocked;
  const canFinishEditing = !hasUnsavedChanges
    && !hasPendingMutation
    && !hasBlockedModules;

  let statusText = '所有内容均已保存';
  if (hasUnsavedChanges) {
    statusText = '还有内容尚未保存';
  } else if (hasPendingMutation) {
    statusText = '正在保存内容';
  } else if (hasBlockedModules) {
    statusText = '请先处理未完成的保存状态';
  }

  return {
    hasUnsavedChanges,
    hasPendingMutation,
    unsavedModules,
    pendingModules,
    blockedModules,
    canFinishEditing,
    statusText,
    shouldWarnBeforeUnload: hasUnsavedChanges || hasPendingMutation,
  };
}
