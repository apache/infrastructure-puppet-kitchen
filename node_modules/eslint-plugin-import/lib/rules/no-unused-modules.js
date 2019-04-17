'use strict';

var _ExportMap = require('../ExportMap');

var _ExportMap2 = _interopRequireDefault(_ExportMap);

var _resolve = require('eslint-module-utils/resolve');

var _resolve2 = _interopRequireDefault(_resolve);

var _docsUrl = require('../docsUrl');

var _docsUrl2 = _interopRequireDefault(_docsUrl);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _toConsumableArray(arr) { if (Array.isArray(arr)) { for (var i = 0, arr2 = Array(arr.length); i < arr.length; i++) arr2[i] = arr[i]; return arr2; } else { return Array.from(arr); } } /**
                                                                                                                                                                                                 * @fileOverview Ensures that modules contain exports and/or all 
                                                                                                                                                                                                 * modules are consumed within other modules.
                                                                                                                                                                                                 * @author René Fermann
                                                                                                                                                                                                 */

// eslint/lib/util/glob-util has been moved to eslint/lib/util/glob-utils with version 5.3
let listFilesToProcess;
try {
  listFilesToProcess = require('eslint/lib/util/glob-utils').listFilesToProcess;
} catch (err) {
  listFilesToProcess = require('eslint/lib/util/glob-util').listFilesToProcess;
}

const EXPORT_DEFAULT_DECLARATION = 'ExportDefaultDeclaration';
const EXPORT_NAMED_DECLARATION = 'ExportNamedDeclaration';
const EXPORT_ALL_DECLARATION = 'ExportAllDeclaration';
const IMPORT_DECLARATION = 'ImportDeclaration';
const IMPORT_NAMESPACE_SPECIFIER = 'ImportNamespaceSpecifier';
const IMPORT_DEFAULT_SPECIFIER = 'ImportDefaultSpecifier';
const VARIABLE_DECLARATION = 'VariableDeclaration';
const FUNCTION_DECLARATION = 'FunctionDeclaration';
const DEFAULT = 'default';

let preparationDone = false;
const importList = new Map();
const exportList = new Map();
const ignoredFiles = new Set();

const isNodeModule = path => {
  return (/\/(node_modules)\//.test(path)
  );
};

/**
 * read all files matching the patterns in src and ignoreExports
 * 
 * return all files matching src pattern, which are not matching the ignoreExports pattern
 */
const resolveFiles = (src, ignoreExports) => {
  const srcFiles = new Set();
  const srcFileList = listFilesToProcess(src);

  // prepare list of ignored files
  const ignoredFilesList = listFilesToProcess(ignoreExports);
  ignoredFilesList.forEach((_ref) => {
    let filename = _ref.filename;
    return ignoredFiles.add(filename);
  });

  // prepare list of source files, don't consider files from node_modules
  srcFileList.filter((_ref2) => {
    let filename = _ref2.filename;
    return !isNodeModule(filename);
  }).forEach((_ref3) => {
    let filename = _ref3.filename;

    srcFiles.add(filename);
  });
  return srcFiles;
};

/**
 * parse all source files and build up 2 maps containing the existing imports and exports
 */
const prepareImportsAndExports = (srcFiles, context) => {
  const exportAll = new Map();
  srcFiles.forEach(file => {
    const exports = new Map();
    const imports = new Map();
    const currentExports = _ExportMap2.default.get(file, context);
    if (currentExports) {
      const dependencies = currentExports.dependencies,
            reexports = currentExports.reexports,
            localImportList = currentExports.imports,
            namespace = currentExports.namespace;

      // dependencies === export * from 

      const currentExportAll = new Set();
      dependencies.forEach(value => {
        currentExportAll.add(value().path);
      });
      exportAll.set(file, currentExportAll);

      reexports.forEach((value, key) => {
        if (key === DEFAULT) {
          exports.set(IMPORT_DEFAULT_SPECIFIER, { whereUsed: new Set() });
        } else {
          exports.set(key, { whereUsed: new Set() });
        }
        const reexport = value.getImport();
        if (!reexport) {
          return;
        }
        let localImport = imports.get(reexport.path);
        let currentValue;
        if (value.local === DEFAULT) {
          currentValue = IMPORT_DEFAULT_SPECIFIER;
        } else {
          currentValue = value.local;
        }
        if (typeof localImport !== 'undefined') {
          localImport = new Set([].concat(_toConsumableArray(localImport), [currentValue]));
        } else {
          localImport = new Set([currentValue]);
        }
        imports.set(reexport.path, localImport);
      });

      localImportList.forEach((value, key) => {
        if (isNodeModule(key)) {
          return;
        }
        imports.set(key, value.importedSpecifiers);
      });
      importList.set(file, imports);

      // build up export list only, if file is not ignored
      if (ignoredFiles.has(file)) {
        return;
      }
      namespace.forEach((value, key) => {
        if (key === DEFAULT) {
          exports.set(IMPORT_DEFAULT_SPECIFIER, { whereUsed: new Set() });
        } else {
          exports.set(key, { whereUsed: new Set() });
        }
      });
    }
    exports.set(EXPORT_ALL_DECLARATION, { whereUsed: new Set() });
    exports.set(IMPORT_NAMESPACE_SPECIFIER, { whereUsed: new Set() });
    exportList.set(file, exports);
  });
  exportAll.forEach((value, key) => {
    value.forEach(val => {
      const currentExports = exportList.get(val);
      const currentExport = currentExports.get(EXPORT_ALL_DECLARATION);
      currentExport.whereUsed.add(key);
    });
  });
};

/**
 * traverse through all imports and add the respective path to the whereUsed-list 
 * of the corresponding export
 */
const determineUsage = () => {
  importList.forEach((listValue, listKey) => {
    listValue.forEach((value, key) => {
      const exports = exportList.get(key);
      if (typeof exports !== 'undefined') {
        value.forEach(currentImport => {
          let specifier;
          if (currentImport === IMPORT_NAMESPACE_SPECIFIER) {
            specifier = IMPORT_NAMESPACE_SPECIFIER;
          } else if (currentImport === IMPORT_DEFAULT_SPECIFIER) {
            specifier = IMPORT_DEFAULT_SPECIFIER;
          } else {
            specifier = currentImport;
          }
          if (typeof specifier !== 'undefined') {
            const exportStatement = exports.get(specifier);
            if (typeof exportStatement !== 'undefined') {
              const whereUsed = exportStatement.whereUsed;

              whereUsed.add(listKey);
              exports.set(specifier, { whereUsed });
            }
          }
        });
      }
    });
  });
};

const getSrc = src => {
  if (src) {
    return src;
  }
  return [process.cwd()];
};

/**
 * prepare the lists of existing imports and exports - should only be executed once at
 * the start of a new eslint run
 */
const doPreparation = (src, ignoreExports, context) => {
  const srcFiles = resolveFiles(getSrc(src), ignoreExports);
  prepareImportsAndExports(srcFiles, context);
  determineUsage();
  preparationDone = true;
};

const newNamespaceImportExists = specifiers => specifiers.some((_ref4) => {
  let type = _ref4.type;
  return type === IMPORT_NAMESPACE_SPECIFIER;
});

const newDefaultImportExists = specifiers => specifiers.some((_ref5) => {
  let type = _ref5.type;
  return type === IMPORT_DEFAULT_SPECIFIER;
});

module.exports = {
  meta: {
    docs: { url: (0, _docsUrl2.default)('no-unused-modules') },
    schema: [{
      properties: {
        src: {
          description: 'files/paths to be analyzed (only for unused exports)',
          type: 'array',
          minItems: 1,
          items: {
            type: 'string',
            minLength: 1
          }
        },
        ignoreExports: {
          description: 'files/paths for which unused exports will not be reported (e.g module entry points)',
          type: 'array',
          minItems: 1,
          items: {
            type: 'string',
            minLength: 1
          }
        },
        missingExports: {
          description: 'report modules without any exports',
          type: 'boolean'
        },
        unusedExports: {
          description: 'report exports without any usage',
          type: 'boolean'
        }
      },
      not: {
        properties: {
          unusedExports: { enum: [false] },
          missingExports: { enum: [false] }
        }
      },
      anyOf: [{
        not: {
          properties: {
            unusedExports: { enum: [true] }
          }
        },
        required: ['missingExports']
      }, {
        not: {
          properties: {
            missingExports: { enum: [true] }
          }
        },
        required: ['unusedExports']
      }, {
        properties: {
          unusedExports: { enum: [true] }
        },
        required: ['unusedExports']
      }, {
        properties: {
          missingExports: { enum: [true] }
        },
        required: ['missingExports']
      }]
    }]
  },

  create: context => {
    var _context$options$ = context.options[0];
    const src = _context$options$.src;
    var _context$options$$ign = _context$options$.ignoreExports;
    const ignoreExports = _context$options$$ign === undefined ? [] : _context$options$$ign,
          missingExports = _context$options$.missingExports,
          unusedExports = _context$options$.unusedExports;


    if (unusedExports && !preparationDone) {
      doPreparation(src, ignoreExports, context);
    }

    const file = context.getFilename();

    const checkExportPresence = node => {
      if (!missingExports) {
        return;
      }

      const exportCount = exportList.get(file);
      const exportAll = exportCount.get(EXPORT_ALL_DECLARATION);
      const namespaceImports = exportCount.get(IMPORT_NAMESPACE_SPECIFIER);

      exportCount.delete(EXPORT_ALL_DECLARATION);
      exportCount.delete(IMPORT_NAMESPACE_SPECIFIER);
      if (missingExports && exportCount.size < 1) {
        // node.body[0] === 'undefined' only happens, if everything is commented out in the file
        // being linted
        context.report(node.body[0] ? node.body[0] : node, 'No exports found');
      }
      exportCount.set(EXPORT_ALL_DECLARATION, exportAll);
      exportCount.set(IMPORT_NAMESPACE_SPECIFIER, namespaceImports);
    };

    const checkUsage = (node, exportedValue) => {
      if (!unusedExports) {
        return;
      }

      if (ignoredFiles.has(file)) {
        return;
      }

      exports = exportList.get(file);

      // special case: export * from 
      const exportAll = exports.get(EXPORT_ALL_DECLARATION);
      if (typeof exportAll !== 'undefined' && exportedValue !== IMPORT_DEFAULT_SPECIFIER) {
        if (exportAll.whereUsed.size > 0) {
          return;
        }
      }

      // special case: namespace import
      const namespaceImports = exports.get(IMPORT_NAMESPACE_SPECIFIER);
      if (typeof namespaceImports !== 'undefined') {
        if (namespaceImports.whereUsed.size > 0) {
          return;
        }
      }

      const exportStatement = exports.get(exportedValue);

      const value = exportedValue === IMPORT_DEFAULT_SPECIFIER ? DEFAULT : exportedValue;

      if (typeof exportStatement !== 'undefined') {
        if (exportStatement.whereUsed.size < 1) {
          context.report(node, `exported declaration '${value}' not used within other modules`);
        }
      } else {
        context.report(node, `exported declaration '${value}' not used within other modules`);
      }
    };

    /**
     * only useful for tools like vscode-eslint
     * 
     * update lists of existing exports during runtime
     */
    const updateExportUsage = node => {
      if (ignoredFiles.has(file)) {
        return;
      }

      let exports = exportList.get(file);

      // new module has been created during runtime
      // include it in further processing
      if (typeof exports === 'undefined') {
        exports = new Map();
      }

      const newExports = new Map();
      const newExportIdentifiers = new Set();

      node.body.forEach((_ref6) => {
        let type = _ref6.type,
            declaration = _ref6.declaration,
            specifiers = _ref6.specifiers;

        if (type === EXPORT_DEFAULT_DECLARATION) {
          newExportIdentifiers.add(IMPORT_DEFAULT_SPECIFIER);
        }
        if (type === EXPORT_NAMED_DECLARATION) {
          if (specifiers.length > 0) {
            specifiers.forEach(specifier => {
              if (specifier.exported) {
                newExportIdentifiers.add(specifier.exported.name);
              }
            });
          }
          if (declaration) {
            if (declaration.type === FUNCTION_DECLARATION) {
              newExportIdentifiers.add(declaration.id.name);
            }
            if (declaration.type === VARIABLE_DECLARATION) {
              declaration.declarations.forEach((_ref7) => {
                let id = _ref7.id;

                newExportIdentifiers.add(id.name);
              });
            }
          }
        }
      });

      // old exports exist within list of new exports identifiers: add to map of new exports
      exports.forEach((value, key) => {
        if (newExportIdentifiers.has(key)) {
          newExports.set(key, value);
        }
      });

      // new export identifiers added: add to map of new exports
      newExportIdentifiers.forEach(key => {
        if (!exports.has(key)) {
          newExports.set(key, { whereUsed: new Set() });
        }
      });

      // preserve information about namespace imports
      let exportAll = exports.get(EXPORT_ALL_DECLARATION);
      let namespaceImports = exports.get(IMPORT_NAMESPACE_SPECIFIER);

      if (typeof namespaceImports === 'undefined') {
        namespaceImports = { whereUsed: new Set() };
      }

      newExports.set(EXPORT_ALL_DECLARATION, exportAll);
      newExports.set(IMPORT_NAMESPACE_SPECIFIER, namespaceImports);
      exportList.set(file, newExports);
    };

    /**
     * only useful for tools like vscode-eslint
     * 
     * update lists of existing imports during runtime
     */
    const updateImportUsage = node => {
      if (!unusedExports) {
        return;
      }

      let oldImportPaths = importList.get(file);
      if (typeof oldImportPaths === 'undefined') {
        oldImportPaths = new Map();
      }

      const oldNamespaceImports = new Set();
      const newNamespaceImports = new Set();

      const oldExportAll = new Set();
      const newExportAll = new Set();

      const oldDefaultImports = new Set();
      const newDefaultImports = new Set();

      const oldImports = new Map();
      const newImports = new Map();
      oldImportPaths.forEach((value, key) => {
        if (value.has(EXPORT_ALL_DECLARATION)) {
          oldExportAll.add(key);
        }
        if (value.has(IMPORT_NAMESPACE_SPECIFIER)) {
          oldNamespaceImports.add(key);
        }
        if (value.has(IMPORT_DEFAULT_SPECIFIER)) {
          oldDefaultImports.add(key);
        }
        value.forEach(val => {
          if (val !== IMPORT_NAMESPACE_SPECIFIER && val !== IMPORT_DEFAULT_SPECIFIER) {
            oldImports.set(val, key);
          }
        });
      });

      node.body.forEach(astNode => {
        let resolvedPath;

        // support for export { value } from 'module'
        if (astNode.type === EXPORT_NAMED_DECLARATION) {
          if (astNode.source) {
            resolvedPath = (0, _resolve2.default)(astNode.source.value, context);
            astNode.specifiers.forEach(specifier => {
              let name;
              if (specifier.exported.name === DEFAULT) {
                name = IMPORT_DEFAULT_SPECIFIER;
              } else {
                name = specifier.local.name;
              }
              newImports.set(name, resolvedPath);
            });
          }
        }

        if (astNode.type === EXPORT_ALL_DECLARATION) {
          resolvedPath = (0, _resolve2.default)(astNode.source.value, context);
          newExportAll.add(resolvedPath);
        }

        if (astNode.type === IMPORT_DECLARATION) {
          resolvedPath = (0, _resolve2.default)(astNode.source.value, context);
          if (!resolvedPath) {
            return;
          }

          if (isNodeModule(resolvedPath)) {
            return;
          }

          if (newNamespaceImportExists(astNode.specifiers)) {
            newNamespaceImports.add(resolvedPath);
          }

          if (newDefaultImportExists(astNode.specifiers)) {
            newDefaultImports.add(resolvedPath);
          }

          astNode.specifiers.forEach(specifier => {
            if (specifier.type === IMPORT_DEFAULT_SPECIFIER || specifier.type === IMPORT_NAMESPACE_SPECIFIER) {
              return;
            }
            newImports.set(specifier.local.name, resolvedPath);
          });
        }
      });

      newExportAll.forEach(value => {
        if (!oldExportAll.has(value)) {
          let imports = oldImportPaths.get(value);
          if (typeof imports === 'undefined') {
            imports = new Set();
          }
          imports.add(EXPORT_ALL_DECLARATION);
          oldImportPaths.set(value, imports);

          let exports = exportList.get(value);
          let currentExport;
          if (typeof exports !== 'undefined') {
            currentExport = exports.get(EXPORT_ALL_DECLARATION);
          } else {
            exports = new Map();
            exportList.set(value, exports);
          }

          if (typeof currentExport !== 'undefined') {
            currentExport.whereUsed.add(file);
          } else {
            const whereUsed = new Set();
            whereUsed.add(file);
            exports.set(EXPORT_ALL_DECLARATION, { whereUsed });
          }
        }
      });

      oldExportAll.forEach(value => {
        if (!newExportAll.has(value)) {
          const imports = oldImportPaths.get(value);
          imports.delete(EXPORT_ALL_DECLARATION);

          const exports = exportList.get(value);
          if (typeof exports !== 'undefined') {
            const currentExport = exports.get(EXPORT_ALL_DECLARATION);
            if (typeof currentExport !== 'undefined') {
              currentExport.whereUsed.delete(file);
            }
          }
        }
      });

      newDefaultImports.forEach(value => {
        if (!oldDefaultImports.has(value)) {
          let imports = oldImportPaths.get(value);
          if (typeof imports === 'undefined') {
            imports = new Set();
          }
          imports.add(IMPORT_DEFAULT_SPECIFIER);
          oldImportPaths.set(value, imports);

          let exports = exportList.get(value);
          let currentExport;
          if (typeof exports !== 'undefined') {
            currentExport = exports.get(IMPORT_DEFAULT_SPECIFIER);
          } else {
            exports = new Map();
            exportList.set(value, exports);
          }

          if (typeof currentExport !== 'undefined') {
            currentExport.whereUsed.add(file);
          } else {
            const whereUsed = new Set();
            whereUsed.add(file);
            exports.set(IMPORT_DEFAULT_SPECIFIER, { whereUsed });
          }
        }
      });

      oldDefaultImports.forEach(value => {
        if (!newDefaultImports.has(value)) {
          const imports = oldImportPaths.get(value);
          imports.delete(IMPORT_DEFAULT_SPECIFIER);

          const exports = exportList.get(value);
          if (typeof exports !== 'undefined') {
            const currentExport = exports.get(IMPORT_DEFAULT_SPECIFIER);
            if (typeof currentExport !== 'undefined') {
              currentExport.whereUsed.delete(file);
            }
          }
        }
      });

      newNamespaceImports.forEach(value => {
        if (!oldNamespaceImports.has(value)) {
          let imports = oldImportPaths.get(value);
          if (typeof imports === 'undefined') {
            imports = new Set();
          }
          imports.add(IMPORT_NAMESPACE_SPECIFIER);
          oldImportPaths.set(value, imports);

          let exports = exportList.get(value);
          let currentExport;
          if (typeof exports !== 'undefined') {
            currentExport = exports.get(IMPORT_NAMESPACE_SPECIFIER);
          } else {
            exports = new Map();
            exportList.set(value, exports);
          }

          if (typeof currentExport !== 'undefined') {
            currentExport.whereUsed.add(file);
          } else {
            const whereUsed = new Set();
            whereUsed.add(file);
            exports.set(IMPORT_NAMESPACE_SPECIFIER, { whereUsed });
          }
        }
      });

      oldNamespaceImports.forEach(value => {
        if (!newNamespaceImports.has(value)) {
          const imports = oldImportPaths.get(value);
          imports.delete(IMPORT_NAMESPACE_SPECIFIER);

          const exports = exportList.get(value);
          if (typeof exports !== 'undefined') {
            const currentExport = exports.get(IMPORT_NAMESPACE_SPECIFIER);
            if (typeof currentExport !== 'undefined') {
              currentExport.whereUsed.delete(file);
            }
          }
        }
      });

      newImports.forEach((value, key) => {
        if (!oldImports.has(key)) {
          let imports = oldImportPaths.get(value);
          if (typeof imports === 'undefined') {
            imports = new Set();
          }
          imports.add(key);
          oldImportPaths.set(value, imports);

          let exports = exportList.get(value);
          let currentExport;
          if (typeof exports !== 'undefined') {
            currentExport = exports.get(key);
          } else {
            exports = new Map();
            exportList.set(value, exports);
          }

          if (typeof currentExport !== 'undefined') {
            currentExport.whereUsed.add(file);
          } else {
            const whereUsed = new Set();
            whereUsed.add(file);
            exports.set(key, { whereUsed });
          }
        }
      });

      oldImports.forEach((value, key) => {
        if (!newImports.has(key)) {
          const imports = oldImportPaths.get(value);
          imports.delete(key);

          const exports = exportList.get(value);
          if (typeof exports !== 'undefined') {
            const currentExport = exports.get(key);
            if (typeof currentExport !== 'undefined') {
              currentExport.whereUsed.delete(file);
            }
          }
        }
      });
    };

    return {
      'Program:exit': node => {
        updateExportUsage(node);
        updateImportUsage(node);
        checkExportPresence(node);
      },
      'ExportDefaultDeclaration': node => {
        checkUsage(node, IMPORT_DEFAULT_SPECIFIER);
      },
      'ExportNamedDeclaration': node => {
        node.specifiers.forEach(specifier => {
          checkUsage(node, specifier.exported.name);
        });
        if (node.declaration) {
          if (node.declaration.type === FUNCTION_DECLARATION) {
            checkUsage(node, node.declaration.id.name);
          }
          if (node.declaration.type === VARIABLE_DECLARATION) {
            node.declaration.declarations.forEach(declaration => {
              checkUsage(node, declaration.id.name);
            });
          }
        }
      }
    };
  }
};
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbInJ1bGVzL25vLXVudXNlZC1tb2R1bGVzLmpzIl0sIm5hbWVzIjpbImxpc3RGaWxlc1RvUHJvY2VzcyIsInJlcXVpcmUiLCJlcnIiLCJFWFBPUlRfREVGQVVMVF9ERUNMQVJBVElPTiIsIkVYUE9SVF9OQU1FRF9ERUNMQVJBVElPTiIsIkVYUE9SVF9BTExfREVDTEFSQVRJT04iLCJJTVBPUlRfREVDTEFSQVRJT04iLCJJTVBPUlRfTkFNRVNQQUNFX1NQRUNJRklFUiIsIklNUE9SVF9ERUZBVUxUX1NQRUNJRklFUiIsIlZBUklBQkxFX0RFQ0xBUkFUSU9OIiwiRlVOQ1RJT05fREVDTEFSQVRJT04iLCJERUZBVUxUIiwicHJlcGFyYXRpb25Eb25lIiwiaW1wb3J0TGlzdCIsIk1hcCIsImV4cG9ydExpc3QiLCJpZ25vcmVkRmlsZXMiLCJTZXQiLCJpc05vZGVNb2R1bGUiLCJwYXRoIiwidGVzdCIsInJlc29sdmVGaWxlcyIsInNyYyIsImlnbm9yZUV4cG9ydHMiLCJzcmNGaWxlcyIsInNyY0ZpbGVMaXN0IiwiaWdub3JlZEZpbGVzTGlzdCIsImZvckVhY2giLCJmaWxlbmFtZSIsImFkZCIsImZpbHRlciIsInByZXBhcmVJbXBvcnRzQW5kRXhwb3J0cyIsImNvbnRleHQiLCJleHBvcnRBbGwiLCJmaWxlIiwiZXhwb3J0cyIsImltcG9ydHMiLCJjdXJyZW50RXhwb3J0cyIsIkV4cG9ydHMiLCJnZXQiLCJkZXBlbmRlbmNpZXMiLCJyZWV4cG9ydHMiLCJsb2NhbEltcG9ydExpc3QiLCJuYW1lc3BhY2UiLCJjdXJyZW50RXhwb3J0QWxsIiwidmFsdWUiLCJzZXQiLCJrZXkiLCJ3aGVyZVVzZWQiLCJyZWV4cG9ydCIsImdldEltcG9ydCIsImxvY2FsSW1wb3J0IiwiY3VycmVudFZhbHVlIiwibG9jYWwiLCJpbXBvcnRlZFNwZWNpZmllcnMiLCJoYXMiLCJ2YWwiLCJjdXJyZW50RXhwb3J0IiwiZGV0ZXJtaW5lVXNhZ2UiLCJsaXN0VmFsdWUiLCJsaXN0S2V5IiwiY3VycmVudEltcG9ydCIsInNwZWNpZmllciIsImV4cG9ydFN0YXRlbWVudCIsImdldFNyYyIsInByb2Nlc3MiLCJjd2QiLCJkb1ByZXBhcmF0aW9uIiwibmV3TmFtZXNwYWNlSW1wb3J0RXhpc3RzIiwic3BlY2lmaWVycyIsInNvbWUiLCJ0eXBlIiwibmV3RGVmYXVsdEltcG9ydEV4aXN0cyIsIm1vZHVsZSIsIm1ldGEiLCJkb2NzIiwidXJsIiwic2NoZW1hIiwicHJvcGVydGllcyIsImRlc2NyaXB0aW9uIiwibWluSXRlbXMiLCJpdGVtcyIsIm1pbkxlbmd0aCIsIm1pc3NpbmdFeHBvcnRzIiwidW51c2VkRXhwb3J0cyIsIm5vdCIsImVudW0iLCJhbnlPZiIsInJlcXVpcmVkIiwiY3JlYXRlIiwib3B0aW9ucyIsImdldEZpbGVuYW1lIiwiY2hlY2tFeHBvcnRQcmVzZW5jZSIsIm5vZGUiLCJleHBvcnRDb3VudCIsIm5hbWVzcGFjZUltcG9ydHMiLCJkZWxldGUiLCJzaXplIiwicmVwb3J0IiwiYm9keSIsImNoZWNrVXNhZ2UiLCJleHBvcnRlZFZhbHVlIiwidXBkYXRlRXhwb3J0VXNhZ2UiLCJuZXdFeHBvcnRzIiwibmV3RXhwb3J0SWRlbnRpZmllcnMiLCJkZWNsYXJhdGlvbiIsImxlbmd0aCIsImV4cG9ydGVkIiwibmFtZSIsImlkIiwiZGVjbGFyYXRpb25zIiwidXBkYXRlSW1wb3J0VXNhZ2UiLCJvbGRJbXBvcnRQYXRocyIsIm9sZE5hbWVzcGFjZUltcG9ydHMiLCJuZXdOYW1lc3BhY2VJbXBvcnRzIiwib2xkRXhwb3J0QWxsIiwibmV3RXhwb3J0QWxsIiwib2xkRGVmYXVsdEltcG9ydHMiLCJuZXdEZWZhdWx0SW1wb3J0cyIsIm9sZEltcG9ydHMiLCJuZXdJbXBvcnRzIiwiYXN0Tm9kZSIsInJlc29sdmVkUGF0aCIsInNvdXJjZSJdLCJtYXBwaW5ncyI6Ijs7QUFNQTs7OztBQUNBOzs7O0FBQ0E7Ozs7OztnTUFSQTs7Ozs7O0FBVUE7QUFDQSxJQUFJQSxrQkFBSjtBQUNBLElBQUk7QUFDRkEsdUJB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O0FBQ0EsZ0JBQUksT0FBT1UsYUFBUCxLQUF5QixXQUE3QixFQUEwQztBQUN4Q0EsNEJBQWNULFNBQWQsQ0FBd0JnRCxNQUF4QixDQUErQjlELElBQS9CO0FBQ0Q7QUFDRjtBQUNGO0FBQ0YsT0FiRDtBQWNELEtBdFFEOztBQXdRQSxXQUFPO0FBQ0wsc0JBQWdCMkQsUUFBUTtBQUN0QlMsMEJBQWtCVCxJQUFsQjtBQUNBa0IsMEJBQWtCbEIsSUFBbEI7QUFDQUQsNEJBQW9CQyxJQUFwQjtBQUNELE9BTEk7QUFNTCxrQ0FBNEJBLFFBQVE7QUFDbENPLG1CQUFXUCxJQUFYLEVBQWlCckYsd0JBQWpCO0FBQ0QsT0FSSTtBQVNMLGdDQUEwQnFGLFFBQVE7QUFDaENBLGFBQUt4QixVQUFMLENBQWdCMUMsT0FBaEIsQ0FBd0JtQyxhQUFhO0FBQ2pDc0MscUJBQVdQLElBQVgsRUFBaUIvQixVQUFVNkMsUUFBVixDQUFtQkMsSUFBcEM7QUFDSCxTQUZEO0FBR0EsWUFBSWYsS0FBS1ksV0FBVCxFQUFzQjtBQUNwQixjQUFJWixLQUFLWSxXQUFMLENBQWlCbEMsSUFBakIsS0FBMEI3RCxvQkFBOUIsRUFBb0Q7QUFDbEQwRix1QkFBV1AsSUFBWCxFQUFpQkEsS0FBS1ksV0FBTCxDQUFpQkksRUFBakIsQ0FBb0JELElBQXJDO0FBQ0Q7QUFDRCxjQUFJZixLQUFLWSxXQUFMLENBQWlCbEMsSUFBakIsS0FBMEI5RCxvQkFBOUIsRUFBb0Q7QUFDbERvRixpQkFBS1ksV0FBTCxDQUFpQkssWUFBakIsQ0FBOEJuRixPQUE5QixDQUFzQzhFLGVBQWU7QUFDbkRMLHlCQUFXUCxJQUFYLEVBQWlCWSxZQUFZSSxFQUFaLENBQWVELElBQWhDO0FBQ0QsYUFGRDtBQUdEO0FBQ0Y7QUFDRjtBQXZCSSxLQUFQO0FBeUJEO0FBbGdCYyxDQUFqQiIsImZpbGUiOiJydWxlcy9uby11bnVzZWQtbW9kdWxlcy5qcyIsInNvdXJjZXNDb250ZW50IjpbIi8qKlxuICogQGZpbGVPdmVydmlldyBFbnN1cmVzIHRoYXQgbW9kdWxlcyBjb250YWluIGV4cG9ydHMgYW5kL29yIGFsbCBcbiAqIG1vZHVsZXMgYXJlIGNvbnN1bWVkIHdpdGhpbiBvdGhlciBtb2R1bGVzLlxuICogQGF1dGhvciBSZW7DqSBGZXJtYW5uXG4gKi9cblxuaW1wb3J0IEV4cG9ydHMgZnJvbSAnLi4vRXhwb3J0TWFwJ1xuaW1wb3J0IHJlc29sdmUgZnJvbSAnZXNsaW50LW1vZHVsZS11dGlscy9yZXNvbHZlJ1xuaW1wb3J0IGRvY3NVcmwgZnJvbSAnLi4vZG9jc1VybCdcblxuLy8gZXNsaW50L2xpYi91dGlsL2dsb2ItdXRpbCBoYXMgYmVlbiBtb3ZlZCB0byBlc2xpbnQvbGliL3V0aWwvZ2xvYi11dGlscyB3aXRoIHZlcnNpb24gNS4zXG5sZXQgbGlzdEZpbGVzVG9Qcm9jZXNzXG50cnkge1xuICBsaXN0RmlsZXNUb1Byb2Nlc3MgPSByZXF1aXJlKCdlc2xpbnQvbGliL3V0aWwvZ2xvYi11dGlscycpLmxpc3RGaWxlc1RvUHJvY2Vzc1xufSBjYXRjaCAoZXJyKSB7XG4gIGxpc3RGaWxlc1RvUHJvY2VzcyA9IHJlcXVpcmUoJ2VzbGludC9saWIvdXRpbC9nbG9iLXV0aWwnKS5saXN0RmlsZXNUb1Byb2Nlc3Ncbn1cblxuY29uc3QgRVhQT1JUX0RFRkFVTFRfREVDTEFSQVRJT04gPSAnRXhwb3J0RGVmYXVsdERlY2xhcmF0aW9uJ1xuY29uc3QgRVhQT1JUX05BTUVEX0RFQ0xBUkFUSU9OID0gJ0V4cG9ydE5hbWVkRGVjbGFyYXRpb24nXG5jb25zdCBFWFBPUlRfQUxMX0RFQ0xBUkFUSU9OID0gJ0V4cG9ydEFsbERlY2xhcmF0aW9uJ1xuY29uc3QgSU1QT1JUX0RFQ0xBUkFUSU9OID0gJ0ltcG9ydERlY2xhcmF0aW9uJyBcbmNvbnN0IElNUE9SVF9OQU1FU1BBQ0VfU1BFQ0lGSUVSID0gJ0ltcG9ydE5hbWVzcGFjZVNwZWNpZmllcidcbmNvbnN0IElNUE9SVF9ERUZBVUxUX1NQRUNJRklFUiA9ICdJbXBvcnREZWZhdWx0U3BlY2lmaWVyJyBcbmNvbnN0IFZBUklBQkxFX0RFQ0xBUkFUSU9OID0gJ1ZhcmlhYmxlRGVjbGFyYXRpb24nXG5jb25zdCBGVU5DVElPTl9ERUNMQVJBVElPTiA9ICdGdW5jdGlvbkRlY2xhcmF0aW9uJ1xuY29uc3QgREVGQVVMVCA9ICdkZWZhdWx0J1xuXG5sZXQgcHJlcGFyYXRpb25Eb25lID0gZmFsc2VcbmNvbnN0IGltcG9ydExpc3QgPSBuZXcgTWFwKClcbmNvbnN0IGV4cG9ydExpc3QgPSBuZXcgTWFwKClcbmNvbnN0IGlnbm9yZWRGaWxlcyA9IG5ldyBTZXQoKVxuXG5jb25zdCBpc05vZGVNb2R1bGUgPSBwYXRoID0+IHtcbiAgcmV0dXJuIC9cXC8obm9kZV9tb2R1bGVzKVxcLy8udGVzdChwYXRoKVxufVxuXG4vKipcbiAqIHJlYWQgYWxsIGZpbGVzIG1hdGNoaW5nIHRoZSBwYXR0ZXJucyBpbiBzcmMgYW5kIGlnbm9yZUV4cG9ydHNcbiAqIFxuICogcmV0dXJuIGFsbCBmaWxlcyBtYXRjaGluZyBzcmMgcGF0dGVybiwgd2hpY2ggYXJlIG5vdCBtYXRjaGluZyB0aGUgaWdub3JlRXhwb3J0cyBwYXR0ZXJuXG4gKi9cbmNvbnN0IHJlc29sdmVGaWxlcyA9IChzcmMsIGlnbm9yZUV4cG9ydHMpID0+IHtcbiAgY29uc3Qgc3JjRmlsZXMgPSBuZXcgU2V0KClcbiAgY29uc3Qgc3JjRmlsZUxpc3QgPSBsaXN0RmlsZXNUb1Byb2Nlc3Moc3JjKVxuXG4gIC8vIHByZXBhcmUgbGlzdCBvZiBpZ25vcmVkIGZpbGVzXG4gIGNvbnN0IGlnbm9yZWRGaWxlc0xpc3QgPSAgbGlzdEZpbGVzVG9Qcm9jZXNzKGlnbm9yZUV4cG9ydHMpXG4gIGlnbm9yZWRGaWxlc0xpc3QuZm9yRWFjaCgoeyBmaWxlbmFtZSB9KSA9PiBpZ25vcmVkRmlsZXMuYWRkKGZpbGVuYW1lKSlcblxuICAvLyBwcmVwYXJlIGxpc3Qgb2Ygc291cmNlIGZpbGVzLCBkb24ndCBjb25zaWRlciBmaWxlcyBmcm9tIG5vZGVfbW9kdWxlc1xuICBzcmNGaWxlTGlzdC5maWx0ZXIoKHsgZmlsZW5hbWUgfSkgPT4gIWlzTm9kZU1vZHVsZShmaWxlbmFtZSkpLmZvckVhY2goKHsgZmlsZW5hbWUgfSkgPT4ge1xuICAgIHNyY0ZpbGVzLmFkZChmaWxlbmFtZSlcbiAgfSlcbiAgcmV0dXJuIHNyY0ZpbGVzXG59XG5cbi8qKlxuICogcGFyc2UgYWxsIHNvdXJjZSBmaWxlcyBhbmQgYnVpbGQgdXAgMiBtYXBzIGNvbnRhaW5pbmcgdGhlIGV4aXN0aW5nIGltcG9ydHMgYW5kIGV4cG9ydHNcbiAqL1xuY29uc3QgcHJlcGFyZUltcG9ydHNBbmRFeHBvcnRzID0gKHNyY0ZpbGVzLCBjb250ZXh0KSA9PiB7XG4gIGNvbnN0IGV4cG9ydEFsbCA9IG5ldyBNYXAoKVxuICBzcmNGaWxlcy5mb3JFYWNoKGZpbGUgPT4ge1xuICAgIGNvbnN0IGV4cG9ydHMgPSBuZXcgTWFwKClcbiAgICBjb25zdCBpbXBvcnRzID0gbmV3IE1hcCgpXG4gICAgY29uc3QgY3VycmVudEV4cG9ydHMgPSBFeHBvcnRzLmdldChmaWxlLCBjb250ZXh0KVxuICAgIGlmIChjdXJyZW50RXhwb3J0cykge1xuICAgICAgY29uc3QgeyBkZXBlbmRlbmNpZXMsIHJlZXhwb3J0cywgaW1wb3J0czogbG9jYWxJbXBvcnRMaXN0LCBuYW1lc3BhY2UgIH0gPSBjdXJyZW50RXhwb3J0c1xuXG4gICAgICAvLyBkZXBlbmRlbmNpZXMgPT09IGV4cG9ydCAqIGZyb20gXG4gICAgICBjb25zdCBjdXJyZW50RXhwb3J0QWxsID0gbmV3IFNldCgpXG4gICAgICBkZXBlbmRlbmNpZXMuZm9yRWFjaCh2YWx1ZSA9PiB7XG4gICAgICAgIGN1cnJlbnRFeHBvcnRBbGwuYWRkKHZhbHVlKCkucGF0aClcbiAgICAgIH0pXG4gICAgICBleHBvcnRBbGwuc2V0KGZpbGUsIGN1cnJlbnRFeHBvcnRBbGwpXG4gICAgICBcbiAgICAgIHJlZXhwb3J0cy5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XG4gICAgICAgIGlmIChrZXkgPT09IERFRkFVTFQpIHtcbiAgICAgICAgICBleHBvcnRzLnNldChJTVBPUlRfREVGQVVMVF9TUEVDSUZJRVIsIHsgd2hlcmVVc2VkOiBuZXcgU2V0KCkgfSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBleHBvcnRzLnNldChrZXksIHsgd2hlcmVVc2VkOiBuZXcgU2V0KCkgfSlcbiAgICAgICAgfVxuICAgICAgICBjb25zdCByZWV4cG9ydCA9ICB2YWx1ZS5nZXRJbXBvcnQoKVxuICAgICAgICBpZiAoIXJlZXhwb3J0KSB7XG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cbiAgICAgICAgbGV0IGxvY2FsSW1wb3J0ID0gaW1wb3J0cy5nZXQocmVleHBvcnQucGF0aClcbiAgICAgICAgbGV0IGN1cnJlbnRWYWx1ZVxuICAgICAgICBpZiAodmFsdWUubG9jYWwgPT09IERFRkFVTFQpIHtcbiAgICAgICAgICBjdXJyZW50VmFsdWUgPSBJTVBPUlRfREVGQVVMVF9TUEVDSUZJRVJcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBjdXJyZW50VmFsdWUgPSB2YWx1ZS5sb2NhbFxuICAgICAgICB9XG4gICAgICAgIGlmICh0eXBlb2YgbG9jYWxJbXBvcnQgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgbG9jYWxJbXBvcnQgPSBuZXcgU2V0KFsuLi5sb2NhbEltcG9ydCwgY3VycmVudFZhbHVlXSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBsb2NhbEltcG9ydCA9IG5ldyBTZXQoW2N1cnJlbnRWYWx1ZV0pXG4gICAgICAgIH1cbiAgICAgICAgaW1wb3J0cy5zZXQocmVleHBvcnQucGF0aCwgbG9jYWxJbXBvcnQpXG4gICAgICB9KVxuXG4gICAgICBsb2NhbEltcG9ydExpc3QuZm9yRWFjaCgodmFsdWUsIGtleSkgPT4ge1xuICAgICAgICBpZiAoaXNOb2RlTW9kdWxlKGtleSkpIHtcbiAgICAgICAgICByZXR1cm5cbiAgICAgICAgfVxuICAgICAgICBpbXBvcnRzLnNldChrZXksIHZhbHVlLmltcG9ydGVkU3BlY2lmaWVycylcbiAgICAgIH0pXG4gICAgICBpbXBvcnRMaXN0LnNldChmaWxlLCBpbXBvcnRzKVxuICAgICAgXG4gICAgICAvLyBidWlsZCB1cCBleHBvcnQgbGlzdCBvbmx5LCBpZiBmaWxlIGlzIG5vdCBpZ25vcmVkXG4gICAgICBpZiAoaWdub3JlZEZpbGVzLmhhcyhmaWxlKSkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cbiAgICAgIG5hbWVzcGFjZS5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XG4gICAgICAgIGlmIChrZXkgPT09IERFRkFVTFQpIHtcbiAgICAgICAgICBleHBvcnRzLnNldChJTVBPUlRfREVGQVVMVF9TUEVDSUZJRVIsIHsgd2hlcmVVc2VkOiBuZXcgU2V0KCkgfSlcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICBleHBvcnRzLnNldChrZXksIHsgd2hlcmVVc2VkOiBuZXcgU2V0KCkgfSlcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICB9XG4gICAgZXhwb3J0cy5zZXQoRVhQT1JUX0FMTF9ERUNMQVJBVElPTiwgeyB3aGVyZVVzZWQ6IG5ldyBTZXQoKSB9KVxuICAgIGV4cG9ydHMuc2V0KElNUE9SVF9OQU1FU1BBQ0VfU1BFQ0lGSUVSLCB7IHdoZXJlVXNlZDogbmV3IFNldCgpIH0pXG4gICAgZXhwb3J0TGlzdC5zZXQoZmlsZSwgZXhwb3J0cylcbiAgfSlcbiAgZXhwb3J0QWxsLmZvckVhY2goKHZhbHVlLCBrZXkpID0+IHtcbiAgICB2YWx1ZS5mb3JFYWNoKHZhbCA9PiB7XG4gICAgICBjb25zdCBjdXJyZW50RXhwb3J0cyA9IGV4cG9ydExpc3QuZ2V0KHZhbClcbiAgICAgIGNvbnN0IGN1cnJlbnRFeHBvcnQgPSBjdXJyZW50RXhwb3J0cy5nZXQoRVhQT1JUX0FMTF9ERUNMQVJBVElPTilcbiAgICAgIGN1cnJlbnRFeHBvcnQud2hlcmVVc2VkLmFkZChrZXkpXG4gICAgfSlcbiAgfSlcbn1cblxuLyoqXG4gKiB0cmF2ZXJzZSB0aHJvdWdoIGFsbCBpbXBvcnRzIGFuZCBhZGQgdGhlIHJlc3BlY3RpdmUgcGF0aCB0byB0aGUgd2hlcmVVc2VkLWxpc3QgXG4gKiBvZiB0aGUgY29ycmVzcG9uZGluZyBleHBvcnRcbiAqL1xuY29uc3QgZGV0ZXJtaW5lVXNhZ2UgPSAoKSA9PiB7XG4gIGltcG9ydExpc3QuZm9yRWFjaCgobGlzdFZhbHVlLCBsaXN0S2V5KSA9PiB7XG4gICAgbGlzdFZhbHVlLmZvckVhY2goKHZhbHVlLCBrZXkpID0+IHtcbiAgICAgIGNvbnN0IGV4cG9ydHMgPSBleHBvcnRMaXN0LmdldChrZXkpXG4gICAgICBpZiAodHlwZW9mIGV4cG9ydHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIHZhbHVlLmZvckVhY2goY3VycmVudEltcG9ydCA9PiB7XG4gICAgICAgICAgbGV0IHNwZWNpZmllclxuICAgICAgICAgIGlmIChjdXJyZW50SW1wb3J0ID09PSBJTVBPUlRfTkFNRVNQQUNFX1NQRUNJRklFUikge1xuICAgICAgICAgICAgc3BlY2lmaWVyID0gSU1QT1JUX05BTUVTUEFDRV9TUEVDSUZJRVJcbiAgICAgICAgICB9IGVsc2UgaWYgKGN1cnJlbnRJbXBvcnQgPT09IElNUE9SVF9ERUZBVUxUX1NQRUNJRklFUikge1xuICAgICAgICAgICAgc3BlY2lmaWVyID0gSU1QT1JUX0RFRkFVTFRfU1BFQ0lGSUVSXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHNwZWNpZmllciA9IGN1cnJlbnRJbXBvcnRcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKHR5cGVvZiBzcGVjaWZpZXIgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBjb25zdCBleHBvcnRTdGF0ZW1lbnQgPSBleHBvcnRzLmdldChzcGVjaWZpZXIpXG4gICAgICAgICAgICBpZiAodHlwZW9mIGV4cG9ydFN0YXRlbWVudCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgICAgY29uc3QgeyB3aGVyZVVzZWQgfSA9IGV4cG9ydFN0YXRlbWVudFxuICAgICAgICAgICAgICB3aGVyZVVzZWQuYWRkKGxpc3RLZXkpXG4gICAgICAgICAgICAgIGV4cG9ydHMuc2V0KHNwZWNpZmllciwgeyB3aGVyZVVzZWQgfSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICB9XG4gICAgfSlcbiAgfSlcbn1cblxuY29uc3QgZ2V0U3JjID0gc3JjID0+IHtcbiAgaWYgKHNyYykge1xuICAgIHJldHVybiBzcmNcbiAgfVxuICByZXR1cm4gW3Byb2Nlc3MuY3dkKCldXG59XG5cbi8qKlxuICogcHJlcGFyZSB0aGUgbGlzdHMgb2YgZXhpc3RpbmcgaW1wb3J0cyBhbmQgZXhwb3J0cyAtIHNob3VsZCBvbmx5IGJlIGV4ZWN1dGVkIG9uY2UgYXRcbiAqIHRoZSBzdGFydCBvZiBhIG5ldyBlc2xpbnQgcnVuXG4gKi9cbmNvbnN0IGRvUHJlcGFyYXRpb24gPSAoc3JjLCBpZ25vcmVFeHBvcnRzLCBjb250ZXh0KSA9PiB7XG4gIGNvbnN0IHNyY0ZpbGVzID0gcmVzb2x2ZUZpbGVzKGdldFNyYyhzcmMpLCBpZ25vcmVFeHBvcnRzKVxuICBwcmVwYXJlSW1wb3J0c0FuZEV4cG9ydHMoc3JjRmlsZXMsIGNvbnRleHQpXG4gIGRldGVybWluZVVzYWdlKClcbiAgcHJlcGFyYXRpb25Eb25lID0gdHJ1ZVxufVxuXG5jb25zdCBuZXdOYW1lc3BhY2VJbXBvcnRFeGlzdHMgPSBzcGVjaWZpZXJzID0+XG4gIHNwZWNpZmllcnMuc29tZSgoeyB0eXBlIH0pID0+IHR5cGUgPT09IElNUE9SVF9OQU1FU1BBQ0VfU1BFQ0lGSUVSKVxuXG5jb25zdCBuZXdEZWZhdWx0SW1wb3J0RXhpc3RzID0gc3BlY2lmaWVycyA9PlxuICBzcGVjaWZpZXJzLnNvbWUoKHsgdHlwZSB9KSA9PiB0eXBlID09PSBJTVBPUlRfREVGQVVMVF9TUEVDSUZJRVIpXG5cbm1vZHVsZS5leHBvcnRzID0ge1xuICBtZXRhOiB7XG4gICAgZG9jczogeyB1cmw6IGRvY3NVcmwoJ25vLXVudXNlZC1tb2R1bGVzJykgfSxcbiAgICBzY2hlbWE6IFt7XG4gICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgIHNyYzoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAnZmlsZXMvcGF0aHMgdG8gYmUgYW5hbHl6ZWQgKG9ubHkgZm9yIHVudXNlZCBleHBvcnRzKScsXG4gICAgICAgICAgdHlwZTogJ2FycmF5JyxcbiAgICAgICAgICBtaW5JdGVtczogMSxcbiAgICAgICAgICBpdGVtczoge1xuICAgICAgICAgICAgdHlwZTogJ3N0cmluZycsXG4gICAgICAgICAgICBtaW5MZW5ndGg6IDEsXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgaWdub3JlRXhwb3J0czoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAgICAgJ2ZpbGVzL3BhdGhzIGZvciB3aGljaCB1bnVzZWQgZXhwb3J0cyB3aWxsIG5vdCBiZSByZXBvcnRlZCAoZS5nIG1vZHVsZSBlbnRyeSBwb2ludHMpJyxcbiAgICAgICAgICB0eXBlOiAnYXJyYXknLFxuICAgICAgICAgIG1pbkl0ZW1zOiAxLFxuICAgICAgICAgIGl0ZW1zOiB7XG4gICAgICAgICAgICB0eXBlOiAnc3RyaW5nJyxcbiAgICAgICAgICAgIG1pbkxlbmd0aDogMSxcbiAgICAgICAgICB9LFxuICAgICAgICB9LFxuICAgICAgICBtaXNzaW5nRXhwb3J0czoge1xuICAgICAgICAgIGRlc2NyaXB0aW9uOiAncmVwb3J0IG1vZHVsZXMgd2l0aG91dCBhbnkgZXhwb3J0cycsXG4gICAgICAgICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgICAgICB9LFxuICAgICAgICB1bnVzZWRFeHBvcnRzOiB7XG4gICAgICAgICAgZGVzY3JpcHRpb246ICdyZXBvcnQgZXhwb3J0cyB3aXRob3V0IGFueSB1c2FnZScsXG4gICAgICAgICAgdHlwZTogJ2Jvb2xlYW4nLFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIG5vdDoge1xuICAgICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgdW51c2VkRXhwb3J0czogeyBlbnVtOiBbZmFsc2VdIH0sXG4gICAgICAgICAgbWlzc2luZ0V4cG9ydHM6IHsgZW51bTogW2ZhbHNlXSB9LFxuICAgICAgICB9LFxuICAgICAgfSxcbiAgICAgIGFueU9mOlt7XG4gICAgICAgIG5vdDoge1xuICAgICAgICAgIHByb3BlcnRpZXM6IHtcbiAgICAgICAgICAgIHVudXNlZEV4cG9ydHM6IHsgZW51bTogW3RydWVdIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgcmVxdWlyZWQ6IFsnbWlzc2luZ0V4cG9ydHMnXSxcbiAgICAgIH0sIHtcbiAgICAgICAgbm90OiB7XG4gICAgICAgICAgcHJvcGVydGllczoge1xuICAgICAgICAgICAgbWlzc2luZ0V4cG9ydHM6IHsgZW51bTogW3RydWVdIH0sXG4gICAgICAgICAgfSxcbiAgICAgICAgfSxcbiAgICAgICAgcmVxdWlyZWQ6IFsndW51c2VkRXhwb3J0cyddLFxuICAgICAgfSwge1xuICAgICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgdW51c2VkRXhwb3J0czogeyBlbnVtOiBbdHJ1ZV0gfSxcbiAgICAgICAgfSxcbiAgICAgICAgcmVxdWlyZWQ6IFsndW51c2VkRXhwb3J0cyddLFxuICAgICAgfSwge1xuICAgICAgICBwcm9wZXJ0aWVzOiB7XG4gICAgICAgICAgbWlzc2luZ0V4cG9ydHM6IHsgZW51bTogW3RydWVdIH0sXG4gICAgICAgIH0sXG4gICAgICAgIHJlcXVpcmVkOiBbJ21pc3NpbmdFeHBvcnRzJ10sXG4gICAgICB9XSxcbiAgICB9XSxcbiAgfSxcblxuICBjcmVhdGU6IGNvbnRleHQgPT4ge1xuICAgIGNvbnN0IHtcbiAgICAgIHNyYyxcbiAgICAgIGlnbm9yZUV4cG9ydHMgPSBbXSxcbiAgICAgIG1pc3NpbmdFeHBvcnRzLFxuICAgICAgdW51c2VkRXhwb3J0cyxcbiAgICB9ID0gY29udGV4dC5vcHRpb25zWzBdXG5cbiAgICBpZiAodW51c2VkRXhwb3J0cyAmJiAhcHJlcGFyYXRpb25Eb25lKSB7XG4gICAgICBkb1ByZXBhcmF0aW9uKHNyYywgaWdub3JlRXhwb3J0cywgY29udGV4dClcbiAgICB9XG4gICAgXG4gICAgY29uc3QgZmlsZSA9IGNvbnRleHQuZ2V0RmlsZW5hbWUoKVxuXG4gICAgY29uc3QgY2hlY2tFeHBvcnRQcmVzZW5jZSA9IG5vZGUgPT4ge1xuICAgICAgaWYgKCFtaXNzaW5nRXhwb3J0cykge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgY29uc3QgZXhwb3J0Q291bnQgPSBleHBvcnRMaXN0LmdldChmaWxlKVxuICAgICAgY29uc3QgZXhwb3J0QWxsID0gZXhwb3J0Q291bnQuZ2V0KEVYUE9SVF9BTExfREVDTEFSQVRJT04pXG4gICAgICBjb25zdCBuYW1lc3BhY2VJbXBvcnRzID0gZXhwb3J0Q291bnQuZ2V0KElNUE9SVF9OQU1FU1BBQ0VfU1BFQ0lGSUVSKVxuXG4gICAgICBleHBvcnRDb3VudC5kZWxldGUoRVhQT1JUX0FMTF9ERUNMQVJBVElPTilcbiAgICAgIGV4cG9ydENvdW50LmRlbGV0ZShJTVBPUlRfTkFNRVNQQUNFX1NQRUNJRklFUilcbiAgICAgIGlmIChtaXNzaW5nRXhwb3J0cyAmJiBleHBvcnRDb3VudC5zaXplIDwgMSkge1xuICAgICAgICAvLyBub2RlLmJvZHlbMF0gPT09ICd1bmRlZmluZWQnIG9ubHkgaGFwcGVucywgaWYgZXZlcnl0aGluZyBpcyBjb21tZW50ZWQgb3V0IGluIHRoZSBmaWxlXG4gICAgICAgIC8vIGJlaW5nIGxpbnRlZFxuICAgICAgICBjb250ZXh0LnJlcG9ydChub2RlLmJvZHlbMF0gPyBub2RlLmJvZHlbMF0gOiBub2RlLCAnTm8gZXhwb3J0cyBmb3VuZCcpXG4gICAgICB9XG4gICAgICBleHBvcnRDb3VudC5zZXQoRVhQT1JUX0FMTF9ERUNMQVJBVElPTiwgZXhwb3J0QWxsKVxuICAgICAgZXhwb3J0Q291bnQuc2V0KElNUE9SVF9OQU1FU1BBQ0VfU1BFQ0lGSUVSLCBuYW1lc3BhY2VJbXBvcnRzKVxuICAgIH1cblxuICAgIGNvbnN0IGNoZWNrVXNhZ2UgPSAobm9kZSwgZXhwb3J0ZWRWYWx1ZSkgPT4ge1xuICAgICAgaWYgKCF1bnVzZWRFeHBvcnRzKSB7XG4gICAgICAgIHJldHVyblxuICAgICAgfVxuXG4gICAgICBpZiAoaWdub3JlZEZpbGVzLmhhcyhmaWxlKSkge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgZXhwb3J0cyA9IGV4cG9ydExpc3QuZ2V0KGZpbGUpXG5cbiAgICAgIC8vIHNwZWNpYWwgY2FzZTogZXhwb3J0ICogZnJvbSBcbiAgICAgIGNvbnN0IGV4cG9ydEFsbCA9IGV4cG9ydHMuZ2V0KEVYUE9SVF9BTExfREVDTEFSQVRJT04pXG4gICAgICBpZiAodHlwZW9mIGV4cG9ydEFsbCAhPT0gJ3VuZGVmaW5lZCcgJiYgZXhwb3J0ZWRWYWx1ZSAhPT0gSU1QT1JUX0RFRkFVTFRfU1BFQ0lGSUVSKSB7XG4gICAgICAgIGlmIChleHBvcnRBbGwud2hlcmVVc2VkLnNpemUgPiAwKSB7XG4gICAgICAgICAgcmV0dXJuXG4gICAgICAgIH1cbiAgICAgIH1cblxuICAgICAgLy8gc3BlY2lhbCBjYXNlOiBuYW1lc3BhY2UgaW1wb3J0XG4gICAgICBjb25zdCBuYW1lc3BhY2VJbXBvcnRzID0gZXhwb3J0cy5nZXQoSU1QT1JUX05BTUVTUEFDRV9TUEVDSUZJRVIpXG4gICAgICBpZiAodHlwZW9mIG5hbWVzcGFjZUltcG9ydHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIGlmIChuYW1lc3BhY2VJbXBvcnRzLndoZXJlVXNlZC5zaXplID4gMCkge1xuICAgICAgICAgIHJldHVyblxuICAgICAgICB9XG4gICAgICB9XG5cbiAgICAgIGNvbnN0IGV4cG9ydFN0YXRlbWVudCA9IGV4cG9ydHMuZ2V0KGV4cG9ydGVkVmFsdWUpXG4gICAgICBcbiAgICAgIGNvbnN0IHZhbHVlID0gZXhwb3J0ZWRWYWx1ZSA9PT0gSU1QT1JUX0RFRkFVTFRfU1BFQ0lGSUVSID8gREVGQVVMVCA6IGV4cG9ydGVkVmFsdWVcbiAgICAgIFxuICAgICAgaWYgKHR5cGVvZiBleHBvcnRTdGF0ZW1lbnQgIT09ICd1bmRlZmluZWQnKXtcbiAgICAgICAgaWYgKGV4cG9ydFN0YXRlbWVudC53aGVyZVVzZWQuc2l6ZSA8IDEpIHtcbiAgICAgICAgICBjb250ZXh0LnJlcG9ydChcbiAgICAgICAgICAgIG5vZGUsXG4gICAgICAgICAgICBgZXhwb3J0ZWQgZGVjbGFyYXRpb24gJyR7dmFsdWV9JyBub3QgdXNlZCB3aXRoaW4gb3RoZXIgbW9kdWxlc2BcbiAgICAgICAgICApXG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGNvbnRleHQucmVwb3J0KFxuICAgICAgICAgIG5vZGUsXG4gICAgICAgICAgYGV4cG9ydGVkIGRlY2xhcmF0aW9uICcke3ZhbHVlfScgbm90IHVzZWQgd2l0aGluIG90aGVyIG1vZHVsZXNgXG4gICAgICAgIClcbiAgICAgIH1cbiAgICB9XG5cbiAgICAvKipcbiAgICAgKiBvbmx5IHVzZWZ1bCBmb3IgdG9vbHMgbGlrZSB2c2NvZGUtZXNsaW50XG4gICAgICogXG4gICAgICogdXBkYXRlIGxpc3RzIG9mIGV4aXN0aW5nIGV4cG9ydHMgZHVyaW5nIHJ1bnRpbWVcbiAgICAgKi9cbiAgICBjb25zdCB1cGRhdGVFeHBvcnRVc2FnZSA9IG5vZGUgPT4ge1xuICAgICAgaWYgKGlnbm9yZWRGaWxlcy5oYXMoZmlsZSkpIHtcbiAgICAgICAgcmV0dXJuXG4gICAgICB9XG5cbiAgICAgIGxldCBleHBvcnRzID0gZXhwb3J0TGlzdC5nZXQoZmlsZSlcblxuICAgICAgLy8gbmV3IG1vZHVsZSBoYXMgYmVlbiBjcmVhdGVkIGR1cmluZyBydW50aW1lXG4gICAgICAvLyBpbmNsdWRlIGl0IGluIGZ1cnRoZXIgcHJvY2Vzc2luZ1xuICAgICAgaWYgKHR5cGVvZiBleHBvcnRzID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICBleHBvcnRzID0gbmV3IE1hcCgpXG4gICAgICB9XG5cbiAgICAgIGNvbnN0IG5ld0V4cG9ydHMgPSBuZXcgTWFwKClcbiAgICAgIGNvbnN0IG5ld0V4cG9ydElkZW50aWZpZXJzID0gbmV3IFNldCgpXG5cbiAgICAgIG5vZGUuYm9keS5mb3JFYWNoKCh7IHR5cGUsIGRlY2xhcmF0aW9uLCBzcGVjaWZpZXJzIH0pID0+IHtcbiAgICAgICAgaWYgKHR5cGUgPT09IEVYUE9SVF9ERUZBVUxUX0RFQ0xBUkFUSU9OKSB7XG4gICAgICAgICAgbmV3RXhwb3J0SWRlbnRpZmllcnMuYWRkKElNUE9SVF9ERUZBVUxUX1NQRUNJRklFUilcbiAgICAgICAgfSBcbiAgICAgICAgaWYgKHR5cGUgPT09IEVYUE9SVF9OQU1FRF9ERUNMQVJBVElPTikge1xuICAgICAgICAgIGlmIChzcGVjaWZpZXJzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICAgIHNwZWNpZmllcnMuZm9yRWFjaChzcGVjaWZpZXIgPT4ge1xuICAgICAgICAgICAgICBpZiAoc3BlY2lmaWVyLmV4cG9ydGVkKSB7XG4gICAgICAgICAgICAgICAgbmV3RXhwb3J0SWRlbnRpZmllcnMuYWRkKHNwZWNpZmllci5leHBvcnRlZC5uYW1lKVxuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9KVxuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoZGVjbGFyYXRpb24pIHtcbiAgICAgICAgICAgIGlmIChkZWNsYXJhdGlvbi50eXBlID09PSBGVU5DVElPTl9ERUNMQVJBVElPTikge1xuICAgICAgICAgICAgICBuZXdFeHBvcnRJZGVudGlmaWVycy5hZGQoZGVjbGFyYXRpb24uaWQubmFtZSlcbiAgICAgICAgICAgIH0gICBcbiAgICAgICAgICAgIGlmIChkZWNsYXJhdGlvbi50eXBlID09PSBWQVJJQUJMRV9ERUNMQVJBVElPTikge1xuICAgICAgICAgICAgICBkZWNsYXJhdGlvbi5kZWNsYXJhdGlvbnMuZm9yRWFjaCgoeyBpZCB9KSA9PiB7XG4gICAgICAgICAgICAgICAgbmV3RXhwb3J0SWRlbnRpZmllcnMuYWRkKGlkLm5hbWUpXG4gICAgICAgICAgICAgIH0pXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KVxuXG4gICAgICAvLyBvbGQgZXhwb3J0cyBleGlzdCB3aXRoaW4gbGlzdCBvZiBuZXcgZXhwb3J0cyBpZGVudGlmaWVyczogYWRkIHRvIG1hcCBvZiBuZXcgZXhwb3J0c1xuICAgICAgZXhwb3J0cy5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XG4gICAgICAgIGlmIChuZXdFeHBvcnRJZGVudGlmaWVycy5oYXMoa2V5KSkge1xuICAgICAgICAgIG5ld0V4cG9ydHMuc2V0KGtleSwgdmFsdWUpXG4gICAgICAgIH1cbiAgICAgIH0pXG5cbiAgICAgIC8vIG5ldyBleHBvcnQgaWRlbnRpZmllcnMgYWRkZWQ6IGFkZCB0byBtYXAgb2YgbmV3IGV4cG9ydHNcbiAgICAgIG5ld0V4cG9ydElkZW50aWZpZXJzLmZvckVhY2goa2V5ID0+IHtcbiAgICAgICAgaWYgKCFleHBvcnRzLmhhcyhrZXkpKSB7XG4gICAgICAgICAgbmV3RXhwb3J0cy5zZXQoa2V5LCB7IHdoZXJlVXNlZDogbmV3IFNldCgpIH0pXG4gICAgICAgIH1cbiAgICAgIH0pXG5cbiAgICAgIC8vIHByZXNlcnZlIGluZm9ybWF0aW9uIGFib3V0IG5hbWVzcGFjZSBpbXBvcnRzXG4gICAgICBsZXQgZXhwb3J0QWxsID0gZXhwb3J0cy5nZXQoRVhQT1JUX0FMTF9ERUNMQVJBVElPTilcbiAgICAgIGxldCBuYW1lc3BhY2VJbXBvcnRzID0gZXhwb3J0cy5nZXQoSU1QT1JUX05BTUVTUEFDRV9TUEVDSUZJRVIpXG4gICAgICBcbiAgICAgIGlmICh0eXBlb2YgbmFtZXNwYWNlSW1wb3J0cyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgbmFtZXNwYWNlSW1wb3J0cyA9IHsgd2hlcmVVc2VkOiBuZXcgU2V0KCkgfVxuICAgICAgfVxuXG4gICAgICBuZXdFeHBvcnRzLnNldChFWFBPUlRfQUxMX0RFQ0xBUkFUSU9OLCBleHBvcnRBbGwpXG4gICAgICBuZXdFeHBvcnRzLnNldChJTVBPUlRfTkFNRVNQQUNFX1NQRUNJRklFUiwgbmFtZXNwYWNlSW1wb3J0cylcbiAgICAgIGV4cG9ydExpc3Quc2V0KGZpbGUsIG5ld0V4cG9ydHMpXG4gICAgfVxuXG4gICAgLyoqXG4gICAgICogb25seSB1c2VmdWwgZm9yIHRvb2xzIGxpa2UgdnNjb2RlLWVzbGludFxuICAgICAqIFxuICAgICAqIHVwZGF0ZSBsaXN0cyBvZiBleGlzdGluZyBpbXBvcnRzIGR1cmluZyBydW50aW1lXG4gICAgICovXG4gICAgY29uc3QgdXBkYXRlSW1wb3J0VXNhZ2UgPSBub2RlID0+IHtcbiAgICAgIGlmICghdW51c2VkRXhwb3J0cykge1xuICAgICAgICByZXR1cm5cbiAgICAgIH1cblxuICAgICAgbGV0IG9sZEltcG9ydFBhdGhzID0gaW1wb3J0TGlzdC5nZXQoZmlsZSlcbiAgICAgIGlmICh0eXBlb2Ygb2xkSW1wb3J0UGF0aHMgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgIG9sZEltcG9ydFBhdGhzID0gbmV3IE1hcCgpXG4gICAgICB9XG4gICAgICBcbiAgICAgIGNvbnN0IG9sZE5hbWVzcGFjZUltcG9ydHMgPSBuZXcgU2V0KClcbiAgICAgIGNvbnN0IG5ld05hbWVzcGFjZUltcG9ydHMgPSBuZXcgU2V0KClcblxuICAgICAgY29uc3Qgb2xkRXhwb3J0QWxsID0gbmV3IFNldCgpXG4gICAgICBjb25zdCBuZXdFeHBvcnRBbGwgPSBuZXcgU2V0KClcbiAgICAgIFxuICAgICAgY29uc3Qgb2xkRGVmYXVsdEltcG9ydHMgPSBuZXcgU2V0KClcbiAgICAgIGNvbnN0IG5ld0RlZmF1bHRJbXBvcnRzID0gbmV3IFNldCgpXG5cbiAgICAgIGNvbnN0IG9sZEltcG9ydHMgPSBuZXcgTWFwKClcbiAgICAgIGNvbnN0IG5ld0ltcG9ydHMgPSBuZXcgTWFwKClcbiAgICAgIG9sZEltcG9ydFBhdGhzLmZvckVhY2goKHZhbHVlLCBrZXkpID0+IHtcbiAgICAgICAgaWYgKHZhbHVlLmhhcyhFWFBPUlRfQUxMX0RFQ0xBUkFUSU9OKSkge1xuICAgICAgICAgIG9sZEV4cG9ydEFsbC5hZGQoa2V5KVxuICAgICAgICB9XG4gICAgICAgIGlmICh2YWx1ZS5oYXMoSU1QT1JUX05BTUVTUEFDRV9TUEVDSUZJRVIpKSB7XG4gICAgICAgICAgb2xkTmFtZXNwYWNlSW1wb3J0cy5hZGQoa2V5KVxuICAgICAgICB9XG4gICAgICAgIGlmICh2YWx1ZS5oYXMoSU1QT1JUX0RFRkFVTFRfU1BFQ0lGSUVSKSkge1xuICAgICAgICAgIG9sZERlZmF1bHRJbXBvcnRzLmFkZChrZXkpXG4gICAgICAgIH1cbiAgICAgICAgdmFsdWUuZm9yRWFjaCh2YWwgPT4ge1xuICAgICAgICAgIGlmICh2YWwgIT09IElNUE9SVF9OQU1FU1BBQ0VfU1BFQ0lGSUVSICYmXG4gICAgICAgICAgICAgIHZhbCAhPT0gSU1QT1JUX0RFRkFVTFRfU1BFQ0lGSUVSKSB7XG4gICAgICAgICAgICAgICBvbGRJbXBvcnRzLnNldCh2YWwsIGtleSlcbiAgICAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICB9KVxuXG4gICAgICBub2RlLmJvZHkuZm9yRWFjaChhc3ROb2RlID0+IHtcbiAgICAgICAgbGV0IHJlc29sdmVkUGF0aFxuXG4gICAgICAgIC8vIHN1cHBvcnQgZm9yIGV4cG9ydCB7IHZhbHVlIH0gZnJvbSAnbW9kdWxlJ1xuICAgICAgICBpZiAoYXN0Tm9kZS50eXBlID09PSBFWFBPUlRfTkFNRURfREVDTEFSQVRJT04pIHtcbiAgICAgICAgICBpZiAoYXN0Tm9kZS5zb3VyY2UpIHtcbiAgICAgICAgICAgIHJlc29sdmVkUGF0aCA9IHJlc29sdmUoYXN0Tm9kZS5zb3VyY2UudmFsdWUsIGNvbnRleHQpXG4gICAgICAgICAgICBhc3ROb2RlLnNwZWNpZmllcnMuZm9yRWFjaChzcGVjaWZpZXIgPT4ge1xuICAgICAgICAgICAgICBsZXQgbmFtZVxuICAgICAgICAgICAgICBpZiAoc3BlY2lmaWVyLmV4cG9ydGVkLm5hbWUgPT09IERFRkFVTFQpIHtcbiAgICAgICAgICAgICAgICBuYW1lID0gSU1QT1JUX0RFRkFVTFRfU1BFQ0lGSUVSXG4gICAgICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICAgICAgbmFtZSA9IHNwZWNpZmllci5sb2NhbC5uYW1lXG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgbmV3SW1wb3J0cy5zZXQobmFtZSwgcmVzb2x2ZWRQYXRoKVxuICAgICAgICAgICAgfSlcbiAgICAgICAgICB9XG4gICAgICAgIH1cblxuICAgICAgICBpZiAoYXN0Tm9kZS50eXBlID09PSBFWFBPUlRfQUxMX0RFQ0xBUkFUSU9OKSB7XG4gICAgICAgICAgcmVzb2x2ZWRQYXRoID0gcmVzb2x2ZShhc3ROb2RlLnNvdXJjZS52YWx1ZSwgY29udGV4dClcbiAgICAgICAgICBuZXdFeHBvcnRBbGwuYWRkKHJlc29sdmVkUGF0aClcbiAgICAgICAgfVxuXG4gICAgICAgIGlmIChhc3ROb2RlLnR5cGUgPT09IElNUE9SVF9ERUNMQVJBVElPTikge1xuICAgICAgICAgIHJlc29sdmVkUGF0aCA9IHJlc29sdmUoYXN0Tm9kZS5zb3VyY2UudmFsdWUsIGNvbnRleHQpICAgICAgIFxuICAgICAgICAgIGlmICghcmVzb2x2ZWRQYXRoKSB7XG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICB9XG4gICAgICAgICAgXG4gICAgICAgICAgaWYgKGlzTm9kZU1vZHVsZShyZXNvbHZlZFBhdGgpKSB7XG4gICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAobmV3TmFtZXNwYWNlSW1wb3J0RXhpc3RzKGFzdE5vZGUuc3BlY2lmaWVycykpIHtcbiAgICAgICAgICAgIG5ld05hbWVzcGFjZUltcG9ydHMuYWRkKHJlc29sdmVkUGF0aClcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAobmV3RGVmYXVsdEltcG9ydEV4aXN0cyhhc3ROb2RlLnNwZWNpZmllcnMpKSB7XG4gICAgICAgICAgICBuZXdEZWZhdWx0SW1wb3J0cy5hZGQocmVzb2x2ZWRQYXRoKVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGFzdE5vZGUuc3BlY2lmaWVycy5mb3JFYWNoKHNwZWNpZmllciA9PiB7XG4gICAgICAgICAgICBpZiAoc3BlY2lmaWVyLnR5cGUgPT09IElNUE9SVF9ERUZBVUxUX1NQRUNJRklFUiB8fFxuICAgICAgICAgICAgICAgIHNwZWNpZmllci50eXBlID09PSBJTVBPUlRfTkFNRVNQQUNFX1NQRUNJRklFUikge1xuICAgICAgICAgICAgICByZXR1cm5cbiAgICAgICAgICAgIH1cbiAgICAgICAgICAgIG5ld0ltcG9ydHMuc2V0KHNwZWNpZmllci5sb2NhbC5uYW1lLCByZXNvbHZlZFBhdGgpXG4gICAgICAgICAgfSlcbiAgICAgICAgfVxuICAgICAgfSlcblxuICAgICAgbmV3RXhwb3J0QWxsLmZvckVhY2godmFsdWUgPT4ge1xuICAgICAgICBpZiAoIW9sZEV4cG9ydEFsbC5oYXModmFsdWUpKSB7XG4gICAgICAgICAgbGV0IGltcG9ydHMgPSBvbGRJbXBvcnRQYXRocy5nZXQodmFsdWUpXG4gICAgICAgICAgaWYgKHR5cGVvZiBpbXBvcnRzID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgaW1wb3J0cyA9IG5ldyBTZXQoKVxuICAgICAgICAgIH1cbiAgICAgICAgICBpbXBvcnRzLmFkZChFWFBPUlRfQUxMX0RFQ0xBUkFUSU9OKVxuICAgICAgICAgIG9sZEltcG9ydFBhdGhzLnNldCh2YWx1ZSwgaW1wb3J0cylcblxuICAgICAgICAgIGxldCBleHBvcnRzID0gZXhwb3J0TGlzdC5nZXQodmFsdWUpXG4gICAgICAgICAgbGV0IGN1cnJlbnRFeHBvcnRcbiAgICAgICAgICBpZiAodHlwZW9mIGV4cG9ydHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBjdXJyZW50RXhwb3J0ID0gZXhwb3J0cy5nZXQoRVhQT1JUX0FMTF9ERUNMQVJBVElPTilcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgZXhwb3J0cyA9IG5ldyBNYXAoKVxuICAgICAgICAgICAgZXhwb3J0TGlzdC5zZXQodmFsdWUsIGV4cG9ydHMpXG4gICAgICAgICAgfVxuXG4gICAgICAgICAgaWYgKHR5cGVvZiBjdXJyZW50RXhwb3J0ICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgY3VycmVudEV4cG9ydC53aGVyZVVzZWQuYWRkKGZpbGUpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGNvbnN0IHdoZXJlVXNlZCA9IG5ldyBTZXQoKVxuICAgICAgICAgICAgd2hlcmVVc2VkLmFkZChmaWxlKVxuICAgICAgICAgICAgZXhwb3J0cy5zZXQoRVhQT1JUX0FMTF9ERUNMQVJBVElPTiwgeyB3aGVyZVVzZWQgfSlcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pXG5cbiAgICAgIG9sZEV4cG9ydEFsbC5mb3JFYWNoKHZhbHVlID0+IHtcbiAgICAgICAgaWYgKCFuZXdFeHBvcnRBbGwuaGFzKHZhbHVlKSkge1xuICAgICAgICAgIGNvbnN0IGltcG9ydHMgPSBvbGRJbXBvcnRQYXRocy5nZXQodmFsdWUpXG4gICAgICAgICAgaW1wb3J0cy5kZWxldGUoRVhQT1JUX0FMTF9ERUNMQVJBVElPTilcblxuICAgICAgICAgIGNvbnN0IGV4cG9ydHMgPSBleHBvcnRMaXN0LmdldCh2YWx1ZSlcbiAgICAgICAgICBpZiAodHlwZW9mIGV4cG9ydHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBjb25zdCBjdXJyZW50RXhwb3J0ID0gZXhwb3J0cy5nZXQoRVhQT1JUX0FMTF9ERUNMQVJBVElPTilcbiAgICAgICAgICAgIGlmICh0eXBlb2YgY3VycmVudEV4cG9ydCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgICAgY3VycmVudEV4cG9ydC53aGVyZVVzZWQuZGVsZXRlKGZpbGUpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KVxuXG4gICAgICBuZXdEZWZhdWx0SW1wb3J0cy5mb3JFYWNoKHZhbHVlID0+IHtcbiAgICAgICAgaWYgKCFvbGREZWZhdWx0SW1wb3J0cy5oYXModmFsdWUpKSB7XG4gICAgICAgICAgbGV0IGltcG9ydHMgPSBvbGRJbXBvcnRQYXRocy5nZXQodmFsdWUpXG4gICAgICAgICAgaWYgKHR5cGVvZiBpbXBvcnRzID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgaW1wb3J0cyA9IG5ldyBTZXQoKVxuICAgICAgICAgIH1cbiAgICAgICAgICBpbXBvcnRzLmFkZChJTVBPUlRfREVGQVVMVF9TUEVDSUZJRVIpXG4gICAgICAgICAgb2xkSW1wb3J0UGF0aHMuc2V0KHZhbHVlLCBpbXBvcnRzKVxuXG4gICAgICAgICAgbGV0IGV4cG9ydHMgPSBleHBvcnRMaXN0LmdldCh2YWx1ZSlcbiAgICAgICAgICBsZXQgY3VycmVudEV4cG9ydFxuICAgICAgICAgIGlmICh0eXBlb2YgZXhwb3J0cyAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIGN1cnJlbnRFeHBvcnQgPSBleHBvcnRzLmdldChJTVBPUlRfREVGQVVMVF9TUEVDSUZJRVIpXG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGV4cG9ydHMgPSBuZXcgTWFwKClcbiAgICAgICAgICAgIGV4cG9ydExpc3Quc2V0KHZhbHVlLCBleHBvcnRzKVxuICAgICAgICAgIH1cblxuICAgICAgICAgIGlmICh0eXBlb2YgY3VycmVudEV4cG9ydCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIGN1cnJlbnRFeHBvcnQud2hlcmVVc2VkLmFkZChmaWxlKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBjb25zdCB3aGVyZVVzZWQgPSBuZXcgU2V0KClcbiAgICAgICAgICAgIHdoZXJlVXNlZC5hZGQoZmlsZSlcbiAgICAgICAgICAgIGV4cG9ydHMuc2V0KElNUE9SVF9ERUZBVUxUX1NQRUNJRklFUiwgeyB3aGVyZVVzZWQgfSlcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pXG5cbiAgICAgIG9sZERlZmF1bHRJbXBvcnRzLmZvckVhY2godmFsdWUgPT4ge1xuICAgICAgICBpZiAoIW5ld0RlZmF1bHRJbXBvcnRzLmhhcyh2YWx1ZSkpIHtcbiAgICAgICAgICBjb25zdCBpbXBvcnRzID0gb2xkSW1wb3J0UGF0aHMuZ2V0KHZhbHVlKVxuICAgICAgICAgIGltcG9ydHMuZGVsZXRlKElNUE9SVF9ERUZBVUxUX1NQRUNJRklFUilcblxuICAgICAgICAgIGNvbnN0IGV4cG9ydHMgPSBleHBvcnRMaXN0LmdldCh2YWx1ZSlcbiAgICAgICAgICBpZiAodHlwZW9mIGV4cG9ydHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBjb25zdCBjdXJyZW50RXhwb3J0ID0gZXhwb3J0cy5nZXQoSU1QT1JUX0RFRkFVTFRfU1BFQ0lGSUVSKVxuICAgICAgICAgICAgaWYgKHR5cGVvZiBjdXJyZW50RXhwb3J0ICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgICBjdXJyZW50RXhwb3J0LndoZXJlVXNlZC5kZWxldGUoZmlsZSlcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pXG5cbiAgICAgIG5ld05hbWVzcGFjZUltcG9ydHMuZm9yRWFjaCh2YWx1ZSA9PiB7XG4gICAgICAgIGlmICghb2xkTmFtZXNwYWNlSW1wb3J0cy5oYXModmFsdWUpKSB7XG4gICAgICAgICAgbGV0IGltcG9ydHMgPSBvbGRJbXBvcnRQYXRocy5nZXQodmFsdWUpXG4gICAgICAgICAgaWYgKHR5cGVvZiBpbXBvcnRzID09PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgaW1wb3J0cyA9IG5ldyBTZXQoKVxuICAgICAgICAgIH1cbiAgICAgICAgICBpbXBvcnRzLmFkZChJTVBPUlRfTkFNRVNQQUNFX1NQRUNJRklFUilcbiAgICAgICAgICBvbGRJbXBvcnRQYXRocy5zZXQodmFsdWUsIGltcG9ydHMpXG5cbiAgICAgICAgICBsZXQgZXhwb3J0cyA9IGV4cG9ydExpc3QuZ2V0KHZhbHVlKVxuICAgICAgICAgIGxldCBjdXJyZW50RXhwb3J0XG4gICAgICAgICAgaWYgKHR5cGVvZiBleHBvcnRzICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgY3VycmVudEV4cG9ydCA9IGV4cG9ydHMuZ2V0KElNUE9SVF9OQU1FU1BBQ0VfU1BFQ0lGSUVSKVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBleHBvcnRzID0gbmV3IE1hcCgpXG4gICAgICAgICAgICBleHBvcnRMaXN0LnNldCh2YWx1ZSwgZXhwb3J0cylcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAodHlwZW9mIGN1cnJlbnRFeHBvcnQgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBjdXJyZW50RXhwb3J0LndoZXJlVXNlZC5hZGQoZmlsZSlcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3Qgd2hlcmVVc2VkID0gbmV3IFNldCgpXG4gICAgICAgICAgICB3aGVyZVVzZWQuYWRkKGZpbGUpXG4gICAgICAgICAgICBleHBvcnRzLnNldChJTVBPUlRfTkFNRVNQQUNFX1NQRUNJRklFUiwgeyB3aGVyZVVzZWQgfSlcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pXG5cbiAgICAgIG9sZE5hbWVzcGFjZUltcG9ydHMuZm9yRWFjaCh2YWx1ZSA9PiB7XG4gICAgICAgIGlmICghbmV3TmFtZXNwYWNlSW1wb3J0cy5oYXModmFsdWUpKSB7XG4gICAgICAgICAgY29uc3QgaW1wb3J0cyA9IG9sZEltcG9ydFBhdGhzLmdldCh2YWx1ZSlcbiAgICAgICAgICBpbXBvcnRzLmRlbGV0ZShJTVBPUlRfTkFNRVNQQUNFX1NQRUNJRklFUilcblxuICAgICAgICAgIGNvbnN0IGV4cG9ydHMgPSBleHBvcnRMaXN0LmdldCh2YWx1ZSlcbiAgICAgICAgICBpZiAodHlwZW9mIGV4cG9ydHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBjb25zdCBjdXJyZW50RXhwb3J0ID0gZXhwb3J0cy5nZXQoSU1QT1JUX05BTUVTUEFDRV9TUEVDSUZJRVIpXG4gICAgICAgICAgICBpZiAodHlwZW9mIGN1cnJlbnRFeHBvcnQgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICAgIGN1cnJlbnRFeHBvcnQud2hlcmVVc2VkLmRlbGV0ZShmaWxlKVxuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSlcblxuICAgICAgbmV3SW1wb3J0cy5mb3JFYWNoKCh2YWx1ZSwga2V5KSA9PiB7XG4gICAgICAgIGlmICghb2xkSW1wb3J0cy5oYXMoa2V5KSkge1xuICAgICAgICAgIGxldCBpbXBvcnRzID0gb2xkSW1wb3J0UGF0aHMuZ2V0KHZhbHVlKVxuICAgICAgICAgIGlmICh0eXBlb2YgaW1wb3J0cyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgIGltcG9ydHMgPSBuZXcgU2V0KClcbiAgICAgICAgICB9XG4gICAgICAgICAgaW1wb3J0cy5hZGQoa2V5KVxuICAgICAgICAgIG9sZEltcG9ydFBhdGhzLnNldCh2YWx1ZSwgaW1wb3J0cylcblxuICAgICAgICAgIGxldCBleHBvcnRzID0gZXhwb3J0TGlzdC5nZXQodmFsdWUpXG4gICAgICAgICAgbGV0IGN1cnJlbnRFeHBvcnRcbiAgICAgICAgICBpZiAodHlwZW9mIGV4cG9ydHMgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBjdXJyZW50RXhwb3J0ID0gZXhwb3J0cy5nZXQoa2V5KVxuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBleHBvcnRzID0gbmV3IE1hcCgpXG4gICAgICAgICAgICBleHBvcnRMaXN0LnNldCh2YWx1ZSwgZXhwb3J0cylcbiAgICAgICAgICB9XG5cbiAgICAgICAgICBpZiAodHlwZW9mIGN1cnJlbnRFeHBvcnQgIT09ICd1bmRlZmluZWQnKSB7XG4gICAgICAgICAgICBjdXJyZW50RXhwb3J0LndoZXJlVXNlZC5hZGQoZmlsZSlcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgY29uc3Qgd2hlcmVVc2VkID0gbmV3IFNldCgpXG4gICAgICAgICAgICB3aGVyZVVzZWQuYWRkKGZpbGUpXG4gICAgICAgICAgICBleHBvcnRzLnNldChrZXksIHsgd2hlcmVVc2VkIH0pXG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KVxuXG4gICAgICBvbGRJbXBvcnRzLmZvckVhY2goKHZhbHVlLCBrZXkpID0+IHtcbiAgICAgICAgaWYgKCFuZXdJbXBvcnRzLmhhcyhrZXkpKSB7XG4gICAgICAgICAgY29uc3QgaW1wb3J0cyA9IG9sZEltcG9ydFBhdGhzLmdldCh2YWx1ZSlcbiAgICAgICAgICBpbXBvcnRzLmRlbGV0ZShrZXkpXG5cbiAgICAgICAgICBjb25zdCBleHBvcnRzID0gZXhwb3J0TGlzdC5nZXQodmFsdWUpXG4gICAgICAgICAgaWYgKHR5cGVvZiBleHBvcnRzICE9PSAndW5kZWZpbmVkJykge1xuICAgICAgICAgICAgY29uc3QgY3VycmVudEV4cG9ydCA9IGV4cG9ydHMuZ2V0KGtleSlcbiAgICAgICAgICAgIGlmICh0eXBlb2YgY3VycmVudEV4cG9ydCAhPT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgICAgICAgICAgY3VycmVudEV4cG9ydC53aGVyZVVzZWQuZGVsZXRlKGZpbGUpXG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KVxuICAgIH1cblxuICAgIHJldHVybiB7XG4gICAgICAnUHJvZ3JhbTpleGl0Jzogbm9kZSA9PiB7XG4gICAgICAgIHVwZGF0ZUV4cG9ydFVzYWdlKG5vZGUpXG4gICAgICAgIHVwZGF0ZUltcG9ydFVzYWdlKG5vZGUpXG4gICAgICAgIGNoZWNrRXhwb3J0UHJlc2VuY2Uobm9kZSlcbiAgICAgIH0sXG4gICAgICAnRXhwb3J0RGVmYXVsdERlY2xhcmF0aW9uJzogbm9kZSA9PiB7XG4gICAgICAgIGNoZWNrVXNhZ2Uobm9kZSwgSU1QT1JUX0RFRkFVTFRfU1BFQ0lGSUVSKVxuICAgICAgfSxcbiAgICAgICdFeHBvcnROYW1lZERlY2xhcmF0aW9uJzogbm9kZSA9PiB7XG4gICAgICAgIG5vZGUuc3BlY2lmaWVycy5mb3JFYWNoKHNwZWNpZmllciA9PiB7XG4gICAgICAgICAgICBjaGVja1VzYWdlKG5vZGUsIHNwZWNpZmllci5leHBvcnRlZC5uYW1lKVxuICAgICAgICB9KVxuICAgICAgICBpZiAobm9kZS5kZWNsYXJhdGlvbikge1xuICAgICAgICAgIGlmIChub2RlLmRlY2xhcmF0aW9uLnR5cGUgPT09IEZVTkNUSU9OX0RFQ0xBUkFUSU9OKSB7XG4gICAgICAgICAgICBjaGVja1VzYWdlKG5vZGUsIG5vZGUuZGVjbGFyYXRpb24uaWQubmFtZSlcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKG5vZGUuZGVjbGFyYXRpb24udHlwZSA9PT0gVkFSSUFCTEVfREVDTEFSQVRJT04pIHtcbiAgICAgICAgICAgIG5vZGUuZGVjbGFyYXRpb24uZGVjbGFyYXRpb25zLmZvckVhY2goZGVjbGFyYXRpb24gPT4ge1xuICAgICAgICAgICAgICBjaGVja1VzYWdlKG5vZGUsIGRlY2xhcmF0aW9uLmlkLm5hbWUpXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSxcbiAgICB9XG4gIH0sXG59XG4iXX0=