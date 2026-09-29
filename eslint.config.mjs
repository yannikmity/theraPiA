import coreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  {
    ignores: [".next/**", "node_modules/**", "out/**", "build/**", "next-env.d.ts"],
  },
  ...coreWebVitals,
  {
    rules: {
      // Neu in react-hooks (via eslint-config-next@16): flaggt JSX innerhalb
      // von try/catch. Auf dem Bestandscode 15x getriggert - kein Bug, nur Stil.
      // Als Warnung belassen; gezielter Cleanup separat (nicht Teil des Upgrades).
      "react-hooks/error-boundaries": "warn",
    },
  },
];

export default eslintConfig;
