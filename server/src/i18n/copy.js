const ko = {
  privacyDescription: 'BCSDLab. Arcade\uC758 \uAC1C\uC778\uC815\uBCF4 \uC218\uC9D1 \uD56D\uBAA9, \uCC98\uB9AC \uBAA9\uC801, \uBCF4\uC720 \uAE30\uAC04, \uC815\uBCF4\uC8FC\uCCB4\uC758 \uAD8C\uB9AC\uC640 \uBB38\uC758 \uC808\uCC28\uB97C \uC548\uB0B4\uD569\uB2C8\uB2E4.',
  siteName: 'BCSDLab. Arcade',
  homeTitle: 'BCSDLab. Game Track 웹 게임 | BCSDLab. Arcade',
  homeDescription: 'BCSDLab. Game Track에서 만든 웹 게임을 모아둔 공간입니다. 설치 없이 브라우저에서 바로 플레이하세요.',
  arcadeTitle: 'Arcade',
  arcadeDescription: 'BCSDLab. Game Track에서 만든 웹 게임을 모아둔 공간입니다. 설치 없이 브라우저에서 바로 플레이하세요.',
  blogTitle: '블로그',
  blogDescription: 'BCSDLab. Game Track의 개발 이야기와 업데이트 소식을 전합니다.',
  blogPageTitle: (page) => `블로그 ${page}페이지`,
  gameArticlesTitle: '게임 아티클',
  gameArticlesDescription: '게임의 개발 과정과 업데이트 소식을 전합니다.',
  developer: '개발자',
  version: '버전',
  privacyTitle: '개인정보처리방침',
  effectiveDate: '시행일자',
  gamePlayDescription: (name) => `${name}을(를) 브라우저에서 바로 플레이하세요.`,
  machineNotice: '이 페이지는 한국어 원문을 기계 번역한 것입니다. 한국어 원문 보기 →',
};

const en = {
  privacyDescription: 'Learn how BCSDLab. Arcade collects, uses, stores, and protects personal information.',
  siteName: 'BCSDLab. Arcade',
  homeTitle: 'BCSDLab. Game Track web games | BCSDLab. Arcade',
  homeDescription: 'A collection of web games made by the BCSDLab. Game Track. Play them instantly in your browser with no installation.',
  arcadeTitle: 'Arcade',
  arcadeDescription: 'Browse web games made by BCSDLab. Game Track members and play them instantly in your browser.',
  blogTitle: 'Blog',
  blogDescription: 'Development stories, patch notes, and news from BCSDLab. Game Track.',
  blogPageTitle: (page) => `Blog — page ${page}`,
  gameArticlesTitle: 'Game articles',
  gameArticlesDescription: 'Development updates, patch notes, and news for this game.',
  developer: 'Developer',
  version: 'Version',
  privacyTitle: 'Privacy Policy',
  effectiveDate: 'Effective date',
  gamePlayDescription: (name) => `Play ${name} directly in your browser.`,
  machineNotice: 'This page was machine-translated from Korean. View the Korean original →',
};

export const copy = Object.freeze({ ko, en });
export default copy;
