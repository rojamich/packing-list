import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { DataProvider } from './context/DataContext';
import { UpdateProvider, useUpdate } from './context/UpdateContext';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Gear from './pages/Gear';
import Pack from './pages/Pack';
import Replace from './pages/Replace';
import Data from './pages/Data';
import BottomNav from './components/BottomNav';
import UpdateBanner from './components/UpdateBanner';
import AccessGate from './components/AccessGate';

export default function App() {
  return (
    <UpdateProvider>
      <Shell />
    </UpdateProvider>
  );
}

function Shell() {
  const user = useAuth();
  const { showBanner, applyUpdate } = useUpdate();

  if (user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <>
        {showBanner && <UpdateBanner onApply={applyUpdate} />}
        <Login />
      </>
    );
  }

  return (
    <DataProvider>
      <AccessGate user={user}>
        <BrowserRouter>
          <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pb-16">
            {showBanner && <UpdateBanner onApply={applyUpdate} />}
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/gear" element={<Gear />} />
              <Route path="/pack" element={<Pack />} />
              <Route path="/replace" element={<Replace />} />
              <Route path="/data" element={<Data />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            <BottomNav />
          </div>
        </BrowserRouter>
      </AccessGate>
    </DataProvider>
  );
}
