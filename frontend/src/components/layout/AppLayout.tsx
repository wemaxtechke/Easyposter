import { LeftSidebar } from '../sidebar/LeftSidebar';
import { RightSidebar } from '../sidebar/RightSidebar';
import { Canvas } from '../canvas/Canvas';

export function AppLayout() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      <aside className="flex w-60 min-w-[200px] shrink-0 flex-col border-r border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <LeftSidebar />
      </aside>
      <main className="flex min-w-0 flex-1 flex-col">
        <Canvas />
      </main>
      <aside className="flex w-60 min-w-[200px] shrink-0 flex-col border-l border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
        <RightSidebar />
      </aside>
    </div>
  );
}
