const GRAC_ASSET_ROOT = `${import.meta.env.BASE_URL}grac`;

export const GRAC_RATING_KEYS = ['all', 'over12', 'over15', 'over18'];

export const GRAC_CONTENT_DESCRIPTOR_KEYS = [
  'sexuality',
  'violence',
  'fear',
  'language',
  'drugs',
  'crime',
  'gambling',
];

export const GRAC_RATING_MARKS = {
  all: `${GRAC_ASSET_ROOT}/rating/all.png`,
  over12: `${GRAC_ASSET_ROOT}/rating/over12.png`,
  over15: `${GRAC_ASSET_ROOT}/rating/over15.png`,
  over18: `${GRAC_ASSET_ROOT}/rating/over18.png`,
};

export const GRAC_CONTENT_MARKS = {
  sexuality: `${GRAC_ASSET_ROOT}/descriptors/sexuality.png`,
  violence: `${GRAC_ASSET_ROOT}/descriptors/violence.png`,
  fear: `${GRAC_ASSET_ROOT}/descriptors/fear.png`,
  language: `${GRAC_ASSET_ROOT}/descriptors/language.png`,
  drugs: `${GRAC_ASSET_ROOT}/descriptors/drugs.png`,
  crime: `${GRAC_ASSET_ROOT}/descriptors/crime.png`,
  gambling: `${GRAC_ASSET_ROOT}/descriptors/gambling.png`,
};
