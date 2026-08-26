import type { ReviewMetadataDto } from './types';
import type { MetadataMutationInput } from './schemas';

export interface MetadataEditorState {
  primaryMaterialCode: string | null;
  secondaryMaterialCodes: string[];
  processCodes: string[];
  problemDomainCodes: string[];
  problemSymptomCodes: string[];
  materialOtherText: string | null;
  processOtherText: string | null;
  problemDomainOtherText: string | null;
  problemSymptomOtherText: string | null;
}

export function emptyMetadataEditorState(): MetadataEditorState {
  return {
    primaryMaterialCode: null,
    secondaryMaterialCodes: [],
    processCodes: [],
    problemDomainCodes: [],
    problemSymptomCodes: [],
    materialOtherText: null,
    processOtherText: null,
    problemDomainOtherText: null,
    problemSymptomOtherText: null,
  };
}

export function createMetadataEditorState(
  metadata: ReviewMetadataDto | null,
): MetadataEditorState {
  if (!metadata) return emptyMetadataEditorState();
  const primary = metadata.materials.find(material => material.isPrimary);
  return {
    primaryMaterialCode: primary?.code ?? null,
    secondaryMaterialCodes: metadata.materials
      .filter(material => !material.isPrimary)
      .map(material => material.code),
    processCodes: metadata.processes.map(process => process.code),
    problemDomainCodes: metadata.problemDomains.map(domain => domain.code),
    problemSymptomCodes: metadata.problemSymptoms.map(symptom => symptom.code),
    materialOtherText: metadata.materialOtherText,
    processOtherText: metadata.processOtherText,
    problemDomainOtherText: metadata.problemDomainOtherText,
    problemSymptomOtherText: metadata.problemSymptomOtherText,
  };
}

export function setPrimaryMaterial(
  state: MetadataEditorState,
  code: string,
): MetadataEditorState {
  return {
    ...state,
    primaryMaterialCode: code,
    secondaryMaterialCodes: state.secondaryMaterialCodes.filter(item => item !== code),
  };
}

export function toggleSecondaryMaterial(
  state: MetadataEditorState,
  code: string,
): MetadataEditorState {
  if (code === state.primaryMaterialCode) return state;
  const exists = state.secondaryMaterialCodes.includes(code);
  return {
    ...state,
    secondaryMaterialCodes: exists
      ? state.secondaryMaterialCodes.filter(item => item !== code)
      : [...state.secondaryMaterialCodes, code],
  };
}

export function toggleProcess(state: MetadataEditorState, code: string): MetadataEditorState {
  return toggleCode(state, 'processCodes', code);
}

export function toggleProblemDomain(
  state: MetadataEditorState,
  code: string,
): MetadataEditorState {
  return toggleCode(state, 'problemDomainCodes', code);
}

export function toggleProblemSymptom(
  state: MetadataEditorState,
  code: string,
): MetadataEditorState {
  return toggleCode(state, 'problemSymptomCodes', code);
}

function toggleCode(
  state: MetadataEditorState,
  key: 'processCodes' | 'problemDomainCodes' | 'problemSymptomCodes',
  code: string,
): MetadataEditorState {
  const exists = state[key].includes(code);
  return {
    ...state,
    [key]: exists ? state[key].filter(item => item !== code) : [...state[key], code],
  };
}

export function setMetadataOtherText(
  state: MetadataEditorState,
  key: 'materialOtherText' | 'processOtherText' | 'problemDomainOtherText' | 'problemSymptomOtherText',
  value: string,
): MetadataEditorState {
  const normalized = value.trim() === '' ? null : value.trim();
  return { ...state, [key]: normalized };
}

export function hasOtherCode(codes: string[]): boolean {
  return codes.includes('OTHER');
}

export function buildMetadataMutationPayload(
  state: MetadataEditorState,
): MetadataMutationInput {
  const materials: MetadataMutationInput['materials'] = [];
  if (state.primaryMaterialCode) {
    materials.push({ code: state.primaryMaterialCode, isPrimary: true });
  }
  for (const code of state.secondaryMaterialCodes) {
    materials.push({ code, isPrimary: false });
  }

  const materialCodes = materials.map(item => item.code);
  const materialOtherText = hasOtherCode(materialCodes)
    ? state.materialOtherText
    : null;
  const processOtherText = hasOtherCode(state.processCodes)
    ? state.processOtherText
    : null;
  const problemDomainOtherText = hasOtherCode(state.problemDomainCodes)
    ? state.problemDomainOtherText
    : null;
  const problemSymptomOtherText = hasOtherCode(state.problemSymptomCodes)
    ? state.problemSymptomOtherText
    : null;

  return {
    expectedVersion: 0,
    materials,
    processes: state.processCodes,
    problemDomains: state.problemDomainCodes,
    problemSymptoms: state.problemSymptomCodes,
    other: {
      materialOtherText,
      processOtherText,
      problemDomainOtherText,
      problemSymptomOtherText,
    },
  };
}

export function canEditMetadata(input: {
  status: string;
  role: string | null;
  currentProfileId: string | null;
  ownerId: string;
  pmoId: string | null;
}): boolean {
  const adminManager = input.role === 'admin' || input.role === 'manager';
  if (input.status === 'draft') {
    if (adminManager) return true;
    if (input.role === null || input.role === 'viewer') return false;
    return input.currentProfileId !== null
      && (
        input.currentProfileId === input.ownerId
        || (input.pmoId !== null && input.currentProfileId === input.pmoId)
      );
  }
  if (input.status === 'submitted' || input.status === 'closed') {
    return adminManager;
  }
  return false;
}

export function hasProcessRequirement(reviewType: string, domainCodes: string[]): boolean {
  if (reviewType !== 'B' && reviewType !== 'C') return false;
  return domainCodes.some(code => ['PROCESS', 'EQUIPMENT_FIXTURE', 'PLATE_FILM'].includes(code));
}
