import * as path from "path";
import * as fs from "fs";
import * as ts from "typescript";

export interface TSConfig {
  files: string[];
  include: string[];
  exclude: string[];
  compilerOptions: {
    paths?: { [alias: string]: string[] };
    [key: string]: unknown;
  };
}

/**
 * Given a file, return the list of files it imports as absolute paths.
 */
export function getImportsForFile(
  file: string,
  srcRoot: string,
  pathAliases: Map<string, string[]>
) {
  // Follow symlink so directory check works.
  file = fs.realpathSync(file);

  if (fs.lstatSync(file).isDirectory()) {
    const index = path.join(file, "index.ts");
    if (fs.existsSync(index)) {
      // https://basarat.gitbooks.io/typescript/docs/tips/barrel.html
      console.warn(`Warning: Barrel import: ${path.relative(srcRoot, file)}`);
      file = index;
    } else {
      throw new Error(
        `Warning: Importing a directory without an index.ts file: ${path.relative(
          srcRoot,
          file
        )}`
      );
    }
  }

  const fileInfo = ts.preProcessFile(fs.readFileSync(file).toString());
  return (
    fileInfo.importedFiles
      .map((importedFile) => importedFile.fileName)
      // remove svg, css imports
      .filter(
        (fileName) =>
          !fileName.endsWith(".css") &&
          !fileName.endsWith(".svg") &&
          !fileName.endsWith(".json")
      )
      .filter(
        (fileName) => !fileName.endsWith(".js") && !fileName.endsWith(".jsx")
      ) // Assume .js/.jsx imports have a .d.ts available
      .filter(
        (fileName) =>
          !fileName.endsWith(".spec.ts") && !fileName.endsWith(".spec.tsx")
      ) // Exclude specs
      .filter((x) => /\//.test(x)) // remove node modules (the import must contain '/')
      // .flatMap((fileName) => {
      //   if (pathAliases.has(fileName)) {
      //     // console.log("import path alias found for filename:", fileName);
      //     return pathAliases
      //       .get(fileName)
      //       .map((aliasedPath) => path.resolve(srcRoot, aliasedPath));
      //   }
      //   return fileName;
      // })
      .map((fileName) => {
        if (/(^\.\/)|(^\.\.\/)/.test(fileName)) {
          return path.resolve(path.dirname(file), fileName);
        }

        return fileName;
      })
      .map((fileName) => {
        // console.log("checking path exists:", fileName);
        if (fs.existsSync(`${fileName}.ts`)) {
          return `${fileName}.ts`;
        }
        if (fs.existsSync(`${fileName}.tsx`)) {
          return `${fileName}.tsx`;
        }
        if (fs.existsSync(`${fileName}.d.ts`)) {
          return `${fileName}.d.ts`;
        }
        if (fs.existsSync(`${fileName}`)) {
          return fileName;
        }
        console.warn(
          `Warning: Unresolved import ${path.relative(srcRoot, fileName)} ` +
            `in ${path.relative(srcRoot, file)}`
        );
        return null;
      })
      .filter((fileName) => !!fileName)
  );
}

/**
 * This class memoizes the list of imports for each file.
 */
export class ImportTracker {
  private imports = new Map<string, string[]>();

  constructor(
    private srcRoot: string,

    public pathAliases: Map<string, string[]>
  ) {}

  public getImports(file: string): string[] {
    if (this.imports.has(file)) {
      return this.imports.get(file);
    }
    const imports = getImportsForFile(file, this.srcRoot, this.pathAliases);
    this.imports.set(file, imports);
    return imports;
  }
}

export type PathAliasMap = Map<string, string[]>;

export function parsePathAliases(tsconfigPath: string): PathAliasMap {
  const tsconfig = JSON.parse(
    fs.readFileSync(tsconfigPath).toString()
  ) as TSConfig;

  console.log("tsconfig", tsconfig);

  if (tsconfig?.compilerOptions?.paths == null) {
    return new Map();
  }

  return new Map([...Object.entries(tsconfig.compilerOptions.paths)]);
}
