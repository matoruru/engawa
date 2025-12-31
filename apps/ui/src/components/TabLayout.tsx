import { BottomTabBar } from "./BottomTabBar";


export function TabLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh w-dvw flex-col overflow-hidden bg-background">
      <div className="flex-1 min-h-0 overflow-hidden">{children}</div>
      <div className="shrink-0">
        <BottomTabBar />
      </div>
    </div>
  );
}
