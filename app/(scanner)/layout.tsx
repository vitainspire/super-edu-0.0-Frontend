import { LogoutButton } from "@/components/scanner/logout-button";
import { ChangeClassButton } from "@/components/scanner/change-class-button";
import { SchoolNameDisplay } from "@/components/scanner/school-name-display";

export default function ScannerLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: "#f1f3f8" }}>
      <header
        className="sticky top-0 z-10 px-4 flex items-center justify-between shrink-0"
        style={{
          backgroundColor: "#0d1b3e",
          height: "calc(3.5rem + env(safe-area-inset-top, 0px))",
          paddingTop: "env(safe-area-inset-top, 0px)",
          paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
          paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
        }}
      >
        <SchoolNameDisplay />
        <div className="flex items-center gap-1">
          <ChangeClassButton />
          <LogoutButton />
        </div>
      </header>
      <main
        className="flex-1 py-5 max-w-lg mx-auto w-full overflow-y-auto"
        style={{
          paddingLeft: "max(1rem, env(safe-area-inset-left, 0px))",
          paddingRight: "max(1rem, env(safe-area-inset-right, 0px))",
          paddingBottom: "max(2rem, env(safe-area-inset-bottom, 0px))",
        }}
      >
        {children}
      </main>
    </div>
  );
}
