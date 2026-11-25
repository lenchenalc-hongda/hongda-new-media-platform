import {
  WOS_V1_IMAGE_CATEGORIES,
} from './production-app-contract';

export interface WosOfficeCorrectionImage {
  readonly category: string;
  readonly image_status: string;
  readonly version_label: string;
}

export interface WosOfficeCorrectionImageState {
  readonly ready: boolean;
  readonly currentImageCount: number;
  readonly distinctCategoryCount: number;
  readonly missingCategories: readonly string[];
}

export function inspectWosOfficeCorrectionImages(
  images: readonly WosOfficeCorrectionImage[],
  versionLabel: string,
): WosOfficeCorrectionImageState {
  const currentImages = images.filter(image =>
    image.image_status === 'READY'
    && image.version_label === versionLabel);
  const categories = new Set(currentImages.map(image => image.category));
  const missingCategories = WOS_V1_IMAGE_CATEGORIES.filter(category =>
    !categories.has(category));
  return {
    ready: currentImages.length === WOS_V1_IMAGE_CATEGORIES.length
      && categories.size === WOS_V1_IMAGE_CATEGORIES.length
      && missingCategories.length === 0,
    currentImageCount: currentImages.length,
    distinctCategoryCount: categories.size,
    missingCategories,
  };
}
