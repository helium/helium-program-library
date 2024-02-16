const fs = require("fs");
const path = require("path");
const prettier = require("prettier");

const docSitePath = path.join(
  __dirname,
  "..",
  "packages",
  "docsite",
  "src",
  "pages",
  "docs",
  "api"
);

const docSiteNavigationStart = path.join(
  __dirname,
  "..",
  "packages",
  "docsite",
  "src",
  "data"
);

type Type = {
  kind: string;
  fields?: {
    name: string;
    type: Type;
  }[];
  type: Type;
  variants?: {
    name: string;
    fields?: {
      name: string;
      type: Type;
    }[];
  }[];
  option?: string;
  vec?: string;
  defined?: string;
};

// Given the idl json, generate an API document as a markdown string. Make an accounts table and args table for each instruction.

const generateIdlDocs = (idlJson: any) => {
  const { instructions, accounts, types } = idlJson;
  const realFileName = idlJson.name
    .split(".")[0]
    .replace(/_/g, " ")
    .replace(/(^|\s)\S/g, (L) => L.toUpperCase());

  let mdFile = `# ${realFileName} SDK

  {% callout title="Quick tip" %}
If you are looking for a quick start guide, check out the [Getting Started](/docs/learn/getting_started) guide. We also have some react examples [here](/docs/learn/react).
{% /callout %}

## Instructions

`;
  instructions.forEach((instruction) => {
    mdFile += `### ${instruction.name}

`;
    mdFile += `#### Accounts

`;
    mdFile += `| Name | Mutability | Signer | Docs |
| ---- | ---------- | ------ | ---- |
`;
    instruction.accounts.forEach((account) => {
      mdFile += `| ${account.name} | ${account.isMut ? "mut" : "immut"} | ${
        account.isSigner ? "yes" : "no"
      } | ${account.docs ? account.docs.join(" ") : ""} |
`;
    });
    mdFile += `
#### Args

`;
    mdFile += `| Name | Type | Docs |
| ---- | ---- | ---- |
`;
    instruction.args.forEach((arg) => {
      mdFile += `| ${arg.name} | ${generateType(arg.type, types).defined} | ${
        arg.docs ? arg.docs.join(" ") : ""
      } |
`;
    });
    mdFile += `
`;
  });
  mdFile += `## Accounts

`;
  accounts?.forEach((account) => {
    mdFile += `### ${account.name}

`;
    mdFile += generateType(account.type, types);
    mdFile += `
`;
  });
  mdFile += `
## Types

`;
  types?.forEach((type) => {
    mdFile += `### ${type.name}

`;
    mdFile += generateType(type.type, types);
    mdFile += `
`;
  });
  return mdFile;
};

const generateType = (type: Type, types: Type[]) => {
  if (type.kind === "enum") {
    let mdFile = `| Variant | Fields |
| ------- | ------ |
`;
    type?.variants?.forEach((variant) => {
      mdFile += `| ${variant.name} | ${
        variant.fields
          ? variant.fields
              .map(
                (field) => `${field.name}: ${generateType(field.type, types)}`
              )
              .join(", ")
          : ""
      } |
`;
    });
    return mdFile;
  } else if (type.kind === "struct") {
    let mdFile = `| Field | Type |
| ----- | ---- |
`;
    type?.fields?.forEach((field) => {
      const type = generateType(field.type, types);

      let typeToDisplay = type;
      if (type?.vec?.defined) {
        typeToDisplay = type.vec.defined;
      } else if (type?.vec?.vec) {
        typeToDisplay = type.vec.vec;
      } else if (type?.vec?.vec?.defined) {
        typeToDisplay = type.vec.vec.defined;
      } else if (type?.vec) {
        typeToDisplay = type.vec;
      } else if (type?.defined) {
        typeToDisplay = type.defined;
      } else if (type?.option) {
        typeToDisplay = type.option;
      }

      mdFile += `| ${field.name} | ${typeToDisplay} |
`;
    });
    return mdFile;
  } else if (type.kind === "option") {
    return `Option<${generateType(type.type, types)}>`;
  }
  return type;
};

const addFileToNavigation = (fileName) => {
  const navigationStart = fs.readFileSync(
    `${docSiteNavigationStart}/navigation.js`,
    "utf8"
  );

  // Find // DOCS NAVIGATION START and start adding each object with title and href
  const navigationStartSplit = navigationStart.split(
    "// DOCS NAVIGATION START"
  );

  const title = fileName
    .replace("-sdk", "")
    .replace(/(^|\s)\S/g, (L) => L.toUpperCase())
    .replace(/-/g, " ");

  let navigationStartSplitWithNewObject = `${navigationStartSplit[0]}// DOCS NAVIGATION START
  { title: '${title}', href: '/docs/api/${fileName}' },\n${navigationStartSplit[1]}`;

  // Overwrite navigation.js with find and replaced string
  fs.writeFileSync(
    `${docSiteNavigationStart}/navigation.js`,
    prettier.format(navigationStartSplitWithNewObject, {
      semi: false,
      parser: "babel",
    })
  );
};

const clearNavigation = () => {
  const navigationStart = fs.readFileSync(
    `${docSiteNavigationStart}/navigation.js`,
    "utf8"
  );
  // First clear everthing in between // Find // DOCS NAVIGATION START and // DOCS NAVIGATION END
  const navigationStartSplitEnd = navigationStart.split(
    "// DOCS NAVIGATION END"
  );

  const navStart = navigationStartSplitEnd[0].split("// DOCS NAVIGATION START");

  let navigationStartSplitEndWithNewObject = `${navStart[0]}
        // DOCS NAVIGATION START
        // DOCS NAVIGATION END${navigationStartSplitEnd[1]}`;

  // Overwrite navigation.js with find and replaced string
  fs.writeFileSync(
    `${docSiteNavigationStart}/navigation.js`,
    prettier.format(navigationStartSplitEndWithNewObject, {
      semi: false,
      parser: "babel",
    })
  );
};

const generateAllIdlDocs = () => {
  // Get all idls from /target/idl folder
  const idlFiles: string[] = fs.readdirSync("./target/idl");
  clearNavigation();

  idlFiles.forEach((fileName) => {
    // Remove .json from fileName
    const realFileName = fileName.split(".")[0].replace(/_/g, "-") + "-sdk";

    console.log(`Generating docs for ${realFileName}`);
    // Parse the json
    const idlJson = JSON.parse(
      fs.readFileSync(`./target/idl/${fileName}`, "utf8")
    );
    // Generate the docs
    const mdFile = generateIdlDocs(idlJson);
    fs.writeFileSync(
      `${docSitePath}/${realFileName}.md`,
      prettier.format(mdFile, {
        semi: false,
        parser: "markdown",
      })
    );
    addFileToNavigation(realFileName);
  });
};

generateAllIdlDocs();
