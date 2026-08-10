import React from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { ThemeProvider } from './context/ThemeContext.jsx';
import { GrowlProvider } from './context/GrowlContext.jsx';
import App from './App.jsx';
import './index.css';

const router = createBrowserRouter([
  {
    path: '*',
    element: <App />,
  },
]);

createRoot(document.getElementById('root')).render(
  <div className="app-shell">
    <ThemeProvider>
      <GrowlProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </GrowlProvider>
    </ThemeProvider>
  </div>,
);
