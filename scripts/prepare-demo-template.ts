import { prepareDemoWorkspaceTemplate } from "../src/server/services/demo";

const result = prepareDemoWorkspaceTemplate();
console.log(result.created
  ? `Prepared the synthetic demo template at ${result.path}`
  : `Synthetic demo template is already ready at ${result.path}`);
