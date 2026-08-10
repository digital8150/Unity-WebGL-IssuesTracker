// Keep the dynamic imports in one place. The data router and intent prefetcher
// both use these functions, so prefetching warms the exact chunks route.lazy
// will consume during navigation.
export const routeLoaders = {
  login: () => import('../pages/LoginPage.jsx'),
  register: () => import('../pages/RegisterPage.jsx'),
  authCallback: () => import('../pages/AuthCallbackPage.jsx'),
  pending: () => import('../pages/PendingPage.jsx'),
  consent: () => import('../pages/AgeConsentPage.jsx'),
  privacy: () => import('../pages/PrivacyPolicyPage.jsx'),
  dashboard: () => import('../pages/DashboardPage.jsx'),
  gameDetail: () => import('../pages/GameDetailPage.jsx'),
  issueDetail: () => import('../pages/IssueDetailPage.jsx'),
  play: () => import('../pages/PlayPage.jsx'),
  gameArticles: () => import('../pages/GameArticlesPage.jsx'),
  report: () => import('../pages/ReportPage.jsx'),
  arcade: () => import('../pages/ArcadePage.jsx'),
  adminUsers: () => import('../pages/AdminUsersPage.jsx'),
  adminBlog: () => import('../pages/AdminBlogPage.jsx'),
  adminBlogEditor: () => import('../pages/AdminBlogEditorPage.jsx'),
  blogList: () => import('../pages/BlogListPage.jsx'),
  blogPost: () => import('../pages/BlogPostPage.jsx'),
};
