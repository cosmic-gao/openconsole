// Ambient declarations for the package's own typecheck.
// Some AI Elements (e.g. canvas) do CSS side-effect imports like
// `import "@xyflow/react/dist/style.css"`; the bundler handles these in apps,
// but tsc needs a module declaration to not error.
declare module "*.css";
