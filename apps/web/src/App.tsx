import { useCallback } from 'react';
import { BrowserRouter, Route, Routes, useNavigate } from 'react-router';
import { QueryClientProvider } from '@tanstack/react-query';
import { MotionConfig } from 'motion/react';
import { Toaster } from 'sonner';
import { Tooltip } from 'radix-ui';
import { queryClient } from './lib/queries';
import { useServerEvents } from './lib/sse';
import { useDesktopNavigation } from './lib/desktop';
import { useAppearanceSync, useIsDark, useIsDesktop, useReducedMotion } from './lib/prefs';
import { AppShell } from './components/shell';
import { RunLauncherProvider } from './components/run-launcher';
import { CommandPaletteProvider } from './components/command-palette';
import { HomePage } from './pages/home';
import { FetchPage } from './pages/fetch';
import { ExplorePage } from './pages/explore';
import { VenuePage } from './pages/venue';
import { PresetsPage } from './pages/presets';
import { PresetEditorPage } from './pages/preset-editor';
import { PacksPage } from './pages/packs';
import { PackEditorPage } from './pages/pack-editor';
import { AutomationsPage } from './pages/automations';
import { AutomationEditorPage } from './pages/automation-editor';
import { RunsPage } from './pages/runs';
import { RunDetailPage } from './pages/run-detail';
import { SettingsPage } from './pages/settings';
import { NotFoundPage } from './pages/not-found';

function Root() {
  const navigate = useNavigate();
  const toRun = useCallback((id: string) => navigate(`/runs/${id}`), [navigate]);
  useServerEvents(toRun);
  useAppearanceSync();
  useDesktopNavigation();
  const reduce = useReducedMotion();
  const dark = useIsDark();
  const desktop = useIsDesktop();
  return (
    <MotionConfig reducedMotion={reduce ? 'always' : 'never'}>
      <Tooltip.Provider>
        <RunLauncherProvider>
          <CommandPaletteProvider>
            <Routes>
              <Route element={<AppShell />}>
                <Route index element={<HomePage />} />
                <Route path="fetch" element={<FetchPage />} />
                <Route path="explore" element={<ExplorePage />} />
                <Route path="explore/:slug" element={<VenuePage />} />
                <Route path="presets" element={<PresetsPage />} />
                <Route path="presets/:id" element={<PresetEditorPage />} />
                <Route path="packs" element={<PacksPage />} />
                <Route path="packs/:id" element={<PackEditorPage />} />
                <Route path="automations" element={<AutomationsPage />} />
                <Route path="automations/:id" element={<AutomationEditorPage />} />
                <Route path="runs" element={<RunsPage />} />
                <Route path="runs/:id" element={<RunDetailPage />} />
                <Route path="settings" element={<SettingsPage />} />
                <Route path="*" element={<NotFoundPage />} />
              </Route>
            </Routes>
          </CommandPaletteProvider>
        </RunLauncherProvider>
      </Tooltip.Provider>
      <Toaster
        theme={dark ? 'dark' : 'light'}
        position={desktop ? 'bottom-right' : 'top-center'}
        offset={desktop ? 24 : 72}
        gap={10}
        toastOptions={{ duration: 4500 }}
      />
    </MotionConfig>
  );
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Root />
      </BrowserRouter>
    </QueryClientProvider>
  );
}
