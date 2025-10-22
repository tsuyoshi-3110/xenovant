import { THEMES, ThemeKey } from "@/lib/themes";

export default function ThemeSelector({
  currentTheme,
  onChange,
}: {
  currentTheme: ThemeKey;
  onChange: (theme: ThemeKey) => void;
}) {
  return (
    <div className="flex flex-wrap gap-4">
      {(Object.keys(THEMES) as ThemeKey[]).map((key) => (
        <button
          key={key}
          onClick={() => onChange(key)}
          className={`w-16 h-16 rounded-full bg-gradient-to-r ${
            THEMES[key]
          } border-4 ${
            currentTheme === key ? "border-black" : "border-transparent"
          }`}
          aria-label={key}
        />
      ))}
    </div>
  );
}
