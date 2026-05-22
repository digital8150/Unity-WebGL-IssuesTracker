import React, { createContext, useContext, useState } from 'react';

const translations = {
  en: {
    nav: {
      signIn: 'Sign in',
      getStarted: 'Get started',
      dashboard: 'Dashboard',
      signOut: 'Sign out',
    },
    hero: {
      badge: 'Unity WebGL · Bug Tracking',
      title: 'Ship faster.',
      titleAccent: 'Catch bugs in the wild.',
      subtitle:
        'Upload your Unity WebGL build, share a URL with testers, and collect structured bug reports straight from inside the game.',
      startFree: 'Start for free',
      signIn: 'Sign in',
      goDashboard: 'Go to Dashboard',
    },
    features: {
      sectionLabel: 'Features',
      title: 'Everything you need to close the feedback loop',
      items: [
        {
          title: 'Upload & Share',
          desc: 'Upload your Unity WebGL build once. Get a shareable URL for testers instantly — no manual file copying, no deploys.',
        },
        {
          title: 'In-game Reporting',
          desc: 'Press F2 inside the game. The overlay captures title, description, console logs, GPU info, and custom game state automatically.',
        },
        {
          title: 'Developer Dashboard',
          desc: 'All reports land in your dashboard, scoped to your game and build version. Filter, search, and track status.',
        },
        {
          title: 'Discord Alerts',
          desc: 'Connect a webhook and get a Discord notification the moment a tester files a report — with full context attached.',
        },
      ],
    },
    howItWorks: {
      sectionLabel: 'How it works',
      title: 'Up and running in minutes',
      steps: [
        { n: '01', title: 'Create a game', desc: 'Add your game to the dashboard and configure a Discord webhook if you want alerts.' },
        { n: '02', title: 'Upload your build', desc: 'Drag and drop the four Unity WebGL output files. We handle serving, compression, and versioning.' },
        { n: '03', title: 'Share the play URL', desc: 'Send testers the /play link. They open it in any browser — no download, no install.' },
        { n: '04', title: 'Collect bug reports', desc: 'Testers press F2, describe the issue, and submit. Reports appear in your dashboard instantly.' },
      ],
    },
    cta: {
      title: 'Ready to stop chasing bugs over Discord?',
      subtitle: 'Free to start. No credit card required.',
      action: 'Create your account',
    },
    footer: {
      tagline: 'Unity WebGL Issue Tracking Platform',
    },
    auth: {
      loginTitle: 'Welcome back',
      loginSub: 'Sign in to your developer account',
      registerTitle: 'Create your account',
      registerSub: 'Start collecting bug reports from your testers',
      githubLogin: 'Continue with GitHub',
      githubRegister: 'Sign up with GitHub',
      orEmail: 'or sign in with email',
      orEmailRegister: 'or create an account with email',
      email: 'Email',
      password: 'Password',
      name: 'Name',
      namePlaceholder: 'Your name',
      emailPlaceholder: 'you@example.com',
      passwordPlaceholder: '••••••••',
      passwordHint: 'At least 8 characters',
      signIn: 'Sign in',
      createAccount: 'Create account',
      signingIn: 'Signing in…',
      creating: 'Creating account…',
      noAccount: "Don't have an account?",
      createOne: 'Create one',
      haveAccount: 'Already have an account?',
      signInLink: 'Sign in',
      githubFailed: 'GitHub sign-in failed. Please try again.',
      passwordTooShort: 'Password must be at least 8 characters',
    },
    dash: {
      title: 'Games',
      sub: 'Manage your Unity WebGL builds and bug reports',
      newGame: '+ New Game',
      loading: 'Loading…',
      noGames: 'No games yet',
      noGamesDesc: 'Create your first game to upload a Unity WebGL build and start collecting bug reports.',
      createFirst: 'Create your first game',
      gameName: 'Game name',
      cancel: 'Cancel',
      create: 'Create',
      creating: 'Creating…',
    },
    gameDetail: {
      back: '← All Games',
      backReports: '← Back to Reports',
      playUrl: 'Play URL',
      builds: 'Builds',
      reports: 'Reports',
      settings: 'Settings',
      uploadTitle: 'Upload New Build',
      uploadHint: 'Select the 4 files from your Unity WebGL Build/ folder: *.loader.js, *.data, *.framework.js, *.wasm (compressed variants accepted).',
      chooseFiles: 'Choose files',
      upload: 'Upload',
      uploading: 'Uploading…',
      versionPlaceholder: 'Version (optional, e.g. 1.2.0)',
      noBuilds: 'No builds uploaded yet.',
      active: 'Active',
      setActive: 'Set active',
      noReports: 'No reports yet. Share the play URL with testers.',
      discordTitle: 'Discord Webhook',
      discordDesc: 'New reports will be forwarded to this webhook. Leave blank to use the server-level fallback.',
      save: 'Save',
      saving: 'Saving…',
      edit: 'Edit',
      notSet: 'Not set',
      cancel: 'Cancel',
    },
    issue: {
      breadcrumb: 'Issue',
      description: 'Description',
      buildInfo: 'Build Info',
      browser: 'Browser Environment',
      customState: 'Custom Game State',
      logs: 'Console Logs',
      showAll: (n) => `Show all ${n} entries`,
      showFewer: 'Show fewer',
      product: 'Product',
      version: 'Version',
      unity: 'Unity',
      platform: 'Platform',
      gameId: 'Game ID',
      buildId: 'Build ID',
      reportedAt: 'Reported at (UTC)',
      userAgent: 'User Agent',
      language: 'Language',
      url: 'URL',
      screen: 'Screen',
      viewport: 'Viewport',
      renderer: 'WebGL Renderer',
      vendor: 'WebGL Vendor',
    },
    loading: 'Loading…',
  },

  ko: {
    nav: {
      signIn: '로그인',
      getStarted: '무료 시작',
      dashboard: '대시보드',
      signOut: '로그아웃',
    },
    hero: {
      badge: 'Unity WebGL · 버그 추적 플랫폼',
      title: '더 빠르게 출시하세요.',
      titleAccent: '버그는 현장에서 잡으세요.',
      subtitle:
        'Unity WebGL 빌드를 업로드하고, 테스터에게 URL을 공유하고, 게임 안에서 바로 구조화된 버그 리포트를 수집하세요.',
      startFree: '무료로 시작하기',
      signIn: '로그인',
      goDashboard: '대시보드로 이동',
    },
    features: {
      sectionLabel: '기능',
      title: '피드백 루프를 완성하는 모든 것',
      items: [
        {
          title: '업로드 & 공유',
          desc: 'Unity WebGL 빌드를 한 번 업로드하면 즉시 공유 URL이 생성됩니다. 파일 복사나 배포 작업은 없습니다.',
        },
        {
          title: '인게임 리포팅',
          desc: '게임 안에서 F2를 누르세요. 오버레이가 제목, 설명, 콘솔 로그, GPU 정보, 커스텀 게임 상태를 자동으로 수집합니다.',
        },
        {
          title: '개발자 대시보드',
          desc: '모든 리포트가 게임과 빌드 버전별로 대시보드에 정렬됩니다. 필터링, 검색, 상태 추적이 가능합니다.',
        },
        {
          title: 'Discord 알림',
          desc: '웹훅을 연결하면 테스터가 리포트를 제출하는 순간 전체 컨텍스트와 함께 Discord 알림을 받습니다.',
        },
      ],
    },
    howItWorks: {
      sectionLabel: '사용 방법',
      title: '몇 분 안에 시작하세요',
      steps: [
        { n: '01', title: '게임 생성', desc: '대시보드에 게임을 추가하고 알림을 원하면 Discord 웹훅을 설정하세요.' },
        { n: '02', title: '빌드 업로드', desc: 'Unity WebGL 출력 파일 4개를 드래그앤드롭하세요. 서빙, 압축, 버전 관리는 저희가 처리합니다.' },
        { n: '03', title: '플레이 URL 공유', desc: '/play 링크를 테스터에게 전달하세요. 다운로드나 설치 없이 어떤 브라우저에서도 실행됩니다.' },
        { n: '04', title: '버그 리포트 수집', desc: '테스터가 F2를 누르고 문제를 설명한 후 제출하면 즉시 대시보드에 리포트가 나타납니다.' },
      ],
    },
    cta: {
      title: 'Discord로 버그를 추적하는 시대는 끝났습니다.',
      subtitle: '무료로 시작. 신용카드 불필요.',
      action: '계정 만들기',
    },
    footer: {
      tagline: 'Unity WebGL 이슈 추적 플랫폼',
    },
    auth: {
      loginTitle: '다시 오신 것을 환영합니다',
      loginSub: '개발자 계정으로 로그인하세요',
      registerTitle: '계정 만들기',
      registerSub: '테스터로부터 버그 리포트를 수집하세요',
      githubLogin: 'GitHub으로 계속하기',
      githubRegister: 'GitHub으로 가입하기',
      orEmail: '또는 이메일로 로그인',
      orEmailRegister: '또는 이메일로 계정 만들기',
      email: '이메일',
      password: '비밀번호',
      name: '이름',
      namePlaceholder: '이름을 입력하세요',
      emailPlaceholder: 'you@example.com',
      passwordPlaceholder: '••••••••',
      passwordHint: '최소 8자 이상',
      signIn: '로그인',
      createAccount: '계정 만들기',
      signingIn: '로그인 중…',
      creating: '계정 생성 중…',
      noAccount: '계정이 없으신가요?',
      createOne: '만들기',
      haveAccount: '이미 계정이 있으신가요?',
      signInLink: '로그인',
      githubFailed: 'GitHub 로그인에 실패했습니다. 다시 시도해 주세요.',
      passwordTooShort: '비밀번호는 최소 8자 이상이어야 합니다.',
    },
    dash: {
      title: '게임',
      sub: 'Unity WebGL 빌드와 버그 리포트를 관리하세요',
      newGame: '+ 새 게임',
      loading: '불러오는 중…',
      noGames: '게임이 없습니다',
      noGamesDesc: '첫 번째 게임을 생성하여 Unity WebGL 빌드를 업로드하고 버그 리포트 수집을 시작하세요.',
      createFirst: '첫 번째 게임 만들기',
      gameName: '게임 이름',
      cancel: '취소',
      create: '만들기',
      creating: '생성 중…',
    },
    gameDetail: {
      back: '← 전체 게임',
      backReports: '← 리포트 목록으로',
      playUrl: '플레이 URL',
      builds: '빌드',
      reports: '리포트',
      settings: '설정',
      uploadTitle: '새 빌드 업로드',
      uploadHint: 'Unity WebGL Build/ 폴더의 파일 4개를 선택하세요: *.loader.js, *.data, *.framework.js, *.wasm (압축 파일 지원).',
      chooseFiles: '파일 선택',
      upload: '업로드',
      uploading: '업로드 중…',
      versionPlaceholder: '버전 (선택사항, 예: 1.2.0)',
      noBuilds: '아직 업로드된 빌드가 없습니다.',
      active: '활성',
      setActive: '활성화',
      noReports: '아직 리포트가 없습니다. 플레이 URL을 테스터에게 공유하세요.',
      discordTitle: 'Discord 웹훅',
      discordDesc: '새 리포트가 이 웹훅으로 전달됩니다. 비워두면 서버 기본 웹훅이 사용됩니다.',
      save: '저장',
      saving: '저장 중…',
      edit: '편집',
      notSet: '설정 안 됨',
      cancel: '취소',
    },
    issue: {
      breadcrumb: '이슈',
      description: '설명',
      buildInfo: '빌드 정보',
      browser: '브라우저 환경',
      customState: '커스텀 게임 상태',
      logs: '콘솔 로그',
      showAll: (n) => `전체 ${n}개 항목 보기`,
      showFewer: '접기',
      product: '제품',
      version: '버전',
      unity: 'Unity',
      platform: '플랫폼',
      gameId: '게임 ID',
      buildId: '빌드 ID',
      reportedAt: '보고 시각 (UTC)',
      userAgent: '유저 에이전트',
      language: '언어',
      url: 'URL',
      screen: '화면',
      viewport: '뷰포트',
      renderer: 'WebGL 렌더러',
      vendor: 'WebGL 공급자',
    },
    loading: '불러오는 중…',
  },
};

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLang] = useState(() => {
    const saved = localStorage.getItem('bugdrop-lang');
    if (saved === 'ko' || saved === 'en') return saved;
    return navigator.language?.startsWith('ko') ? 'ko' : 'en';
  });

  function toggleLang() {
    const next = lang === 'en' ? 'ko' : 'en';
    localStorage.setItem('bugdrop-lang', next);
    setLang(next);
  }

  return (
    <I18nContext.Provider value={{ lang, toggleLang, t: translations[lang] }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
