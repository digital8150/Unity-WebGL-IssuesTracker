const GRAC_ORIGIN = 'https://www.gcrb.or.kr';

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
  all: `${GRAC_ORIGIN}/images/grade_icon_n/icon_all.gif`,
  over12: `${GRAC_ORIGIN}/images/grade_icon_n/icon_over12.gif`,
  over15: `${GRAC_ORIGIN}/images/grade_icon_n/icon_over15.gif`,
  over18: `${GRAC_ORIGIN}/images/grade_icon_n/icon_over18.gif`,
};

export const GRAC_CONTENT_MARKS = {
  sexuality: `${GRAC_ORIGIN}/images/grade_icon/grade1.gif`,
  violence: `${GRAC_ORIGIN}/images/grade_icon/grade2.gif`,
  fear: `${GRAC_ORIGIN}/images/grade_icon/grade3.gif`,
  language: `${GRAC_ORIGIN}/images/grade_icon/grade4.gif`,
  drugs: `${GRAC_ORIGIN}/images/grade_icon/grade5.gif`,
  crime: `${GRAC_ORIGIN}/images/grade_icon/grade6.gif`,
  gambling: `${GRAC_ORIGIN}/images/grade_icon/grade7.gif`,
};
