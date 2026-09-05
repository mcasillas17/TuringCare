import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import type ts from "typescript";
import { describe, expect, it } from "vitest";

const tsCompiler = createRequire(import.meta.url)("typescript") as typeof ts;

const PRODUCTION_SOURCE_ROOTS = ["src"] as const;
const REVIEWED_IDENTITY_TEXT = new Set(["TuringCare", "Turing", "Care", "EN", "ES"]);
const REVIEWED_NONCOPY_TEXT = new Set(["z"]);
const REVIEWED_AUTHORED_UI_PRODUCERS = new Set([
  "@/lib/brief:useBrief",
  "@/lib/courses:useCourse",
  "@/lib/dogs:useDog",
  "@/lib/journal:useUpdateEntry",
  "@/lib/overview:useOverview",
  "@/lib/shared-brief:useSharedBrief",
  "@/lib/trainers:useTrainer",
  "@/lib/training-catalog:findCatalogSkill",
  "@/lib/training-catalog:findCatalogTemplate",
]);
const AUDITED_OBJECT_PROPERTIES = new Set([
  "description",
  "emptyText",
  "heading",
  "label",
  "subtitle",
  "text",
  "title",
]);
const AUDITED_ATTRIBUTES = new Set([
  "alt",
  "aria-description",
  "aria-label",
  "aria-placeholder",
  "aria-roledescription",
  "aria-valuetext",
  "closeLabel",
  "containerAriaLabel",
  "placeholder",
  ...AUDITED_OBJECT_PROPERTIES,
]);
const DIRECT_LOCALE_METHODS = new Set([
  "toLocaleDateString",
  "toLocaleString",
  "toLocaleTimeString",
]);
const TOAST_COPY_METHODS = new Set(["error", "info", "loading", "message", "success", "warning"]);
const TOAST_OPTION_COPY_PROPERTIES = new Set(["description"]);
const TOAST_PROMISE_COPY_PROPERTIES = new Set(["description", "error", "loading", "success"]);
const REVIEWED_NON_UI_RETURN_FUNCTIONS = new Set([
  // Auth callback URL chrome is protocol data, not visible interface copy.
  "src/lib/auth-navigation.ts:verificationCallbackUrl",
  "src/components/progress/contextual-progress-presentation.tsx:serializeContext",
  "src/components/turing-tips.ts:tipContextForPath",
  "src/lib/brief-chrome.ts:normalizeBriefLocale",
  "src/lib/brief-errors.ts:briefSendErrorMessageKey",
  "src/lib/contextual-progress.ts:contextualProgressDogKey",
  "src/lib/contextual-progress.ts:contextualProgressKey",
  "src/lib/guided-setup.ts:guidedSetupErrorMessageKey",
  "src/lib/suggestion-key.ts:suggestionKey",
  "src/lib/weekly-focus.ts:focusKey",
  "src/lib/when.ts:dayKindOf",
  "src/lib/when.ts:toLocalInputValue",
  "src/routes/admin/panels/event-category.ts:eventCategory",
]);
const UNICODE_LETTER = /\p{L}/u;

type Diagnostic = {
  category: string;
  detail: string;
  filePath: string;
  line: number;
};

type StaticDeclaration = ts.BindingElement | ts.ParameterDeclaration | ts.VariableDeclaration;

type AuditContext = {
  checker: ts.TypeChecker;
  resolving: Set<ts.Node>;
};

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function isAuditableText(value: string): boolean {
  const normalized = normalizeText(value);
  const identityCandidate = normalized.replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return (
    UNICODE_LETTER.test(normalized) &&
    !REVIEWED_IDENTITY_TEXT.has(identityCandidate) &&
    !REVIEWED_NONCOPY_TEXT.has(normalized)
  );
}

function isUnresolvedFixedCopyCandidate(value: string): boolean {
  if (value.startsWith("[dynamic:")) return value.includes("()");
  return value.startsWith("[import:");
}

function unwrap(expression: ts.Expression): ts.Expression {
  if (
    tsCompiler.isParenthesizedExpression(expression) ||
    tsCompiler.isAsExpression(expression) ||
    tsCompiler.isTypeAssertionExpression(expression) ||
    tsCompiler.isSatisfiesExpression(expression) ||
    tsCompiler.isNonNullExpression(expression)
  ) {
    return unwrap(expression.expression);
  }
  return expression;
}

function stringLiteralValue(expression: ts.Expression | undefined): string | null {
  if (!expression) return null;
  const value = unwrap(expression);
  return tsCompiler.isStringLiteral(value) || tsCompiler.isNoSubstitutionTemplateLiteral(value)
    ? value.text
    : null;
}

function staticInitializerDeclaration(symbol: ts.Symbol | undefined): StaticDeclaration | null {
  if (!symbol || symbol.declarations?.length !== 1) return null;
  const declaration = symbol.declarations[0];
  if (declaration && tsCompiler.isBindingElement(declaration) && declaration.initializer) {
    return declaration;
  }
  if (declaration && tsCompiler.isParameter(declaration) && declaration.initializer) {
    return declaration;
  }
  if (
    !declaration ||
    !tsCompiler.isVariableDeclaration(declaration) ||
    !declaration.initializer ||
    !tsCompiler.isVariableDeclarationList(declaration.parent) ||
    !(declaration.parent.flags & tsCompiler.NodeFlags.Const)
  ) {
    return null;
  }
  return declaration;
}

function localStaticInitializer(
  identifier: ts.Identifier,
  checker: ts.TypeChecker,
): StaticDeclaration | null {
  return staticInitializerDeclaration(checker.getSymbolAtLocation(identifier));
}

function shorthandStaticInitializer(
  property: ts.ShorthandPropertyAssignment,
  checker: ts.TypeChecker,
): StaticDeclaration | null {
  return staticInitializerDeclaration(checker.getShorthandAssignmentValueSymbol(property));
}

function shorthandFunctionDeclaration(
  property: ts.ShorthandPropertyAssignment,
  checker: ts.TypeChecker,
): ts.FunctionDeclaration | null {
  const symbol = checker.getShorthandAssignmentValueSymbol(property);
  if (!symbol || symbol.declarations?.length !== 1) return null;
  const declaration = symbol.declarations[0];
  return declaration && tsCompiler.isFunctionDeclaration(declaration) && declaration.body
    ? declaration
    : null;
}

function isImportedSymbol(symbol: ts.Symbol | undefined): boolean {
  return Boolean(
    symbol?.declarations?.some(
      (declaration) =>
        tsCompiler.isImportClause(declaration) ||
        tsCompiler.isImportSpecifier(declaration) ||
        tsCompiler.isNamespaceImport(declaration),
    ),
  );
}

function isImportedIdentifier(identifier: ts.Identifier, checker: ts.TypeChecker): boolean {
  return isImportedSymbol(checker.getSymbolAtLocation(identifier));
}

function isImportedShorthand(
  property: ts.ShorthandPropertyAssignment,
  checker: ts.TypeChecker,
): boolean {
  return isImportedSymbol(checker.getShorthandAssignmentValueSymbol(property));
}

function importSource(declaration: ts.Declaration): string | null {
  let current: ts.Node | undefined = declaration;
  while (current && !tsCompiler.isSourceFile(current)) {
    if (tsCompiler.isImportDeclaration(current)) {
      return stringLiteralValue(current.moduleSpecifier);
    }
    current = current.parent;
  }
  return null;
}

function isReviewedAuthoredProducer(
  declarations: StaticDeclaration[],
  checker: ts.TypeChecker,
): boolean {
  const resolving = new Set<ts.Declaration>();
  const identifierIsReviewedImport = (identifier: ts.Identifier) => {
    const symbols = [checker.getSymbolAtLocation(identifier)];
    if (
      tsCompiler.isShorthandPropertyAssignment(identifier.parent) &&
      identifier.parent.name === identifier
    ) {
      symbols.push(checker.getShorthandAssignmentValueSymbol(identifier.parent));
    }
    return symbols.some((symbol) =>
      symbol?.declarations?.some((declaration) => {
        if (!tsCompiler.isImportSpecifier(declaration)) return false;
        const importedName = declaration.propertyName?.text ?? declaration.name.text;
        const source = importSource(declaration);
        return Boolean(source && REVIEWED_AUTHORED_UI_PRODUCERS.has(`${source}:${importedName}`));
      }),
    );
  };
  const namespaceImportSource = (identifier: ts.Identifier) => {
    const declaration = checker
      .getSymbolAtLocation(identifier)
      ?.declarations?.find(tsCompiler.isNamespaceImport);
    return declaration ? importSource(declaration) : null;
  };
  const memberName = (
    expression: ts.PropertyAccessExpression | ts.ElementAccessExpression,
  ): string | null =>
    tsCompiler.isPropertyAccessExpression(expression)
      ? expression.name.text
      : stringLiteralValue(expression.argumentExpression);
  const frozenObjectMember = (expression: ts.Expression, name: string): ts.Expression | null => {
    const value = unwrap(expression);
    if (tsCompiler.isIdentifier(value)) {
      const declaration = localStaticInitializer(value, checker);
      if (!declaration?.initializer || resolving.has(declaration)) return null;
      resolving.add(declaration);
      const member = frozenObjectMember(declaration.initializer, name);
      resolving.delete(declaration);
      return member;
    }
    if (
      !tsCompiler.isCallExpression(value) ||
      value.arguments.length !== 1 ||
      !tsCompiler.isPropertyAccessExpression(value.expression) ||
      value.expression.name.text !== "freeze" ||
      !tsCompiler.isIdentifier(value.expression.expression) ||
      value.expression.expression.text !== "Object"
    ) {
      return null;
    }
    const objectSymbol = checker.getSymbolAtLocation(value.expression.expression);
    if (
      objectSymbol?.declarations?.some(
        (declaration) => declaration.getSourceFile() === value.getSourceFile(),
      )
    ) {
      return null;
    }
    const argument = value.arguments[0];
    if (!argument) return null;
    const object = unwrap(argument);
    if (!tsCompiler.isObjectLiteralExpression(object)) return null;
    for (let index = object.properties.length - 1; index >= 0; index -= 1) {
      const property = object.properties[index];
      if (!property) continue;
      if (tsCompiler.isSpreadAssignment(property)) return null;
      if (tsCompiler.isPropertyAssignment(property) && propertyName(property.name) === name) {
        return property.initializer;
      }
      if (tsCompiler.isShorthandPropertyAssignment(property) && property.name.text === name) {
        return property.name;
      }
    }
    return null;
  };
  const calleeUsesReviewedProducer = (expression: ts.Expression): boolean => {
    const value = unwrap(expression);
    if (tsCompiler.isIdentifier(value)) {
      if (identifierIsReviewedImport(value)) return true;
      const declaration = localStaticInitializer(value, checker);
      if (!declaration?.initializer || resolving.has(declaration)) return false;
      resolving.add(declaration);
      const reviewed = calleeUsesReviewedProducer(declaration.initializer);
      resolving.delete(declaration);
      return reviewed;
    }
    if (
      !tsCompiler.isPropertyAccessExpression(value) &&
      !tsCompiler.isElementAccessExpression(value)
    ) {
      return false;
    }
    const name = memberName(value);
    if (!name) return false;
    const owner = unwrap(value.expression);
    if (tsCompiler.isIdentifier(owner)) {
      const source = namespaceImportSource(owner);
      if (source && REVIEWED_AUTHORED_UI_PRODUCERS.has(`${source}:${name}`)) return true;
    }
    const member = frozenObjectMember(value.expression, name);
    return Boolean(member && calleeUsesReviewedProducer(member));
  };
  const expressionUsesReviewedProducer = (expression: ts.Expression): boolean => {
    const value = unwrap(expression);
    if (tsCompiler.isCallExpression(value)) {
      return calleeUsesReviewedProducer(value.expression);
    }
    if (
      tsCompiler.isPropertyAccessExpression(value) ||
      tsCompiler.isElementAccessExpression(value)
    ) {
      return expressionUsesReviewedProducer(value.expression);
    }
    if (!tsCompiler.isIdentifier(value)) return false;
    const declaration = checker.getSymbolAtLocation(value)?.declarations?.[0];
    if (!declaration || resolving.has(declaration)) return false;
    const initializer = tsCompiler.isVariableDeclaration(declaration)
      ? declaration.initializer
      : tsCompiler.isBindingElement(declaration) &&
          tsCompiler.isVariableDeclaration(declaration.parent.parent)
        ? declaration.parent.parent.initializer
        : undefined;
    if (!initializer) return false;
    resolving.add(declaration);
    const reviewed = expressionUsesReviewedProducer(initializer);
    resolving.delete(declaration);
    return reviewed;
  };

  return declarations.some((declaration) => {
    const initializer = tsCompiler.isVariableDeclaration(declaration)
      ? declaration.initializer
      : tsCompiler.isBindingElement(declaration) &&
          tsCompiler.isVariableDeclaration(declaration.parent.parent)
        ? declaration.parent.parent.initializer
        : undefined;
    return Boolean(initializer && expressionUsesReviewedProducer(initializer));
  });
}

function isSonnerToastImport(identifier: ts.Identifier, checker: ts.TypeChecker): boolean {
  const symbol = checker.getSymbolAtLocation(identifier);
  return Boolean(
    symbol?.declarations?.some(
      (declaration) =>
        tsCompiler.isImportSpecifier(declaration) &&
        (declaration.propertyName?.text ?? declaration.name.text) === "toast" &&
        importSource(declaration) === "sonner",
    ),
  );
}

function isSonnerNamespaceImport(identifier: ts.Identifier, checker: ts.TypeChecker): boolean {
  const symbol = checker.getSymbolAtLocation(identifier);
  return Boolean(
    symbol?.declarations?.some(
      (declaration) =>
        tsCompiler.isNamespaceImport(declaration) && importSource(declaration) === "sonner",
    ),
  );
}

function importedExpressionPath(expression: ts.Expression, checker: ts.TypeChecker): string | null {
  const value = unwrap(expression);
  if (tsCompiler.isIdentifier(value)) {
    return isImportedIdentifier(value, checker) ? value.text : null;
  }
  if (tsCompiler.isPropertyAccessExpression(value)) {
    const prefix = importedExpressionPath(value.expression, checker);
    return prefix ? `${prefix}.${value.name.text}` : null;
  }
  if (tsCompiler.isElementAccessExpression(value)) {
    const prefix = importedExpressionPath(value.expression, checker);
    const property = stringLiteralValue(value.argumentExpression);
    return prefix && property ? `${prefix}.${property}` : null;
  }
  return null;
}

function importedSpreadPath(
  expression: ts.Expression,
  context: AuditContext,
  resolving = new Set<ts.Node>(),
): string | null {
  const value = unwrap(expression);
  const path = importedExpressionPath(value, context.checker);
  if (path) return path;
  if (tsCompiler.isCallExpression(value)) {
    const callee = importedSpreadPath(value.expression, context, resolving);
    return callee ? `${callee}()` : null;
  }
  if (tsCompiler.isObjectLiteralExpression(value)) {
    for (const property of value.properties) {
      if (!tsCompiler.isSpreadAssignment(property)) continue;
      const nested = importedSpreadPath(property.expression, context, resolving);
      if (nested) return nested;
    }
    return null;
  }

  const local = localStaticExpression(value, context);
  if (!local || local.declarations.some((declaration) => resolving.has(declaration))) return null;
  if (local.unresolved?.length) return null;
  for (const declaration of local.declarations) resolving.add(declaration);
  const resolved = importedSpreadPath(local.expression, context, resolving);
  for (const declaration of local.declarations) resolving.delete(declaration);
  return resolved;
}

function isSonnerToastExpression(
  expression: ts.Expression,
  context: AuditContext,
  resolving = new Set<ts.Node>(),
): boolean {
  const value = unwrap(expression);
  if (tsCompiler.isIdentifier(value)) {
    if (isSonnerToastImport(value, context.checker)) return true;
  } else if (
    (tsCompiler.isPropertyAccessExpression(value) || tsCompiler.isElementAccessExpression(value)) &&
    calledMethodName(value) === "toast"
  ) {
    const owner = unwrap(value.expression);
    if (tsCompiler.isIdentifier(owner) && isSonnerNamespaceImport(owner, context.checker)) {
      return true;
    }
  }

  if (!tsCompiler.isIdentifier(value)) return false;

  const local = localStaticExpression(value, context);
  if (!local || local.declarations.some((declaration) => resolving.has(declaration))) return false;
  for (const declaration of local.declarations) resolving.add(declaration);
  const resolved = isSonnerToastExpression(local.expression, context, resolving);
  for (const declaration of local.declarations) resolving.delete(declaration);
  return resolved;
}

type AuditedFunction =
  | ts.ArrowFunction
  | ts.FunctionDeclaration
  | ts.FunctionExpression
  | ts.GetAccessorDeclaration
  | ts.MethodDeclaration;

function hasExportModifier(node: ts.Node): boolean {
  return Boolean(
    tsCompiler.canHaveModifiers(node) &&
      tsCompiler
        .getModifiers(node)
        ?.some((modifier) => modifier.kind === tsCompiler.SyntaxKind.ExportKeyword),
  );
}

function exportedFunctionName(node: AuditedFunction): string | null {
  if (tsCompiler.isFunctionDeclaration(node)) {
    return hasExportModifier(node) ? (node.name?.text ?? "default") : null;
  }
  if (tsCompiler.isGetAccessorDeclaration(node) || tsCompiler.isMethodDeclaration(node)) {
    return null;
  }
  const declaration = node.parent;
  if (
    !tsCompiler.isVariableDeclaration(declaration) ||
    !tsCompiler.isIdentifier(declaration.name)
  ) {
    return null;
  }
  const declarationList = declaration.parent;
  const statement = declarationList.parent;
  return tsCompiler.isVariableStatement(statement) && hasExportModifier(statement)
    ? declaration.name.text
    : null;
}

function enclosingAuditedFunction(node: ts.Node): AuditedFunction | null {
  let current = node.parent;
  while (current) {
    if (
      tsCompiler.isArrowFunction(current) ||
      tsCompiler.isFunctionDeclaration(current) ||
      tsCompiler.isFunctionExpression(current) ||
      tsCompiler.isGetAccessorDeclaration(current) ||
      tsCompiler.isMethodDeclaration(current)
    ) {
      return current;
    }
    current = current.parent;
  }
  return null;
}

function isReviewedNonUiReturn(filePath: string, functionName: string): boolean {
  const normalizedFilePath = filePath.split(path.sep).join("/");
  return REVIEWED_NON_UI_RETURN_FUNCTIONS.has(`${normalizedFilePath}:${functionName}`);
}

function returnedExpressions(fn: AuditedFunction): ts.Expression[] {
  if (tsCompiler.isArrowFunction(fn) && !tsCompiler.isBlock(fn.body)) return [fn.body];
  if (!fn.body) return [];

  const expressions: ts.Expression[] = [];
  const visit = (node: ts.Node) => {
    if (
      node !== fn.body &&
      (tsCompiler.isArrowFunction(node) ||
        tsCompiler.isFunctionDeclaration(node) ||
        tsCompiler.isFunctionExpression(node) ||
        tsCompiler.isGetAccessorDeclaration(node) ||
        tsCompiler.isMethodDeclaration(node))
    ) {
      return;
    }
    if (tsCompiler.isReturnStatement(node)) {
      if (node.expression) expressions.push(node.expression);
      return;
    }
    tsCompiler.forEachChild(node, visit);
  };
  visit(fn.body);
  return expressions;
}

function localCalledFunction(
  expression: ts.Expression,
  context: AuditContext,
  resolving = new Set<ts.Node>(),
): AuditedFunction | null {
  const callee = unwrap(expression);
  if (tsCompiler.isArrowFunction(callee) || tsCompiler.isFunctionExpression(callee)) return callee;
  if (
    tsCompiler.isPropertyAccessExpression(callee) ||
    tsCompiler.isElementAccessExpression(callee)
  ) {
    const name = calledMethodName(callee);
    const properties = name ? resolvedObjectProperties(callee.expression, context).properties : [];
    const method = properties.find(
      (property) =>
        tsCompiler.isMethodDeclaration(property) && propertyName(property.name) === name,
    );
    if (method && tsCompiler.isMethodDeclaration(method)) return method;
    const shorthand = properties.find(
      (property) =>
        tsCompiler.isShorthandPropertyAssignment(property) && property.name.text === name,
    );
    if (shorthand && tsCompiler.isShorthandPropertyAssignment(shorthand)) {
      const fn = shorthandFunctionDeclaration(shorthand, context.checker);
      if (fn) return fn;
    }

    const local = localStaticExpression(callee, context);
    if (!local || local.declarations.some((declaration) => resolving.has(declaration))) {
      return null;
    }
    for (const declaration of local.declarations) resolving.add(declaration);
    const resolved = localCalledFunction(local.expression, context, resolving);
    for (const declaration of local.declarations) resolving.delete(declaration);
    return resolved;
  }
  if (!tsCompiler.isIdentifier(callee)) return null;
  const symbol = context.checker.getSymbolAtLocation(callee);
  if (!symbol || symbol.declarations?.length !== 1) return null;
  const declaration = symbol.declarations[0];
  if (!declaration || resolving.has(declaration)) return null;
  if (tsCompiler.isFunctionDeclaration(declaration)) return declaration.body ? declaration : null;
  if (!tsCompiler.isVariableDeclaration(declaration) || !declaration.initializer) return null;

  const initializer = unwrap(declaration.initializer);
  if (tsCompiler.isArrowFunction(initializer) || tsCompiler.isFunctionExpression(initializer)) {
    return initializer;
  }

  resolving.add(declaration);
  const resolved = localCalledFunction(initializer, context, resolving);
  resolving.delete(declaration);
  return resolved;
}

type ResolvedStaticExpression = {
  additionalExpressions?: ts.Expression[];
  declarations: StaticDeclaration[];
  expression: ts.Expression;
  unresolved?: string[];
};

function unresolvedMemberPath(unresolved: string, member: string): string {
  return unresolved.endsWith("]") ? `${unresolved.slice(0, -1)}.${member}]` : unresolved;
}

function bindingPatternSource(
  pattern: ts.BindingPattern,
  context: AuditContext,
): ResolvedStaticExpression | null {
  const owner = pattern.parent;
  if (tsCompiler.isBindingElement(owner)) {
    return destructuredBindingExpression(owner, context);
  }
  if (
    !tsCompiler.isVariableDeclaration(owner) ||
    !owner.initializer ||
    !tsCompiler.isVariableDeclarationList(owner.parent) ||
    !(owner.parent.flags & tsCompiler.NodeFlags.Const)
  ) {
    return null;
  }
  return { declarations: [owner], expression: owner.initializer };
}

type ResolvedArrayElements = {
  elements: Array<ts.Expression | null>;
  unresolved: string[];
};

function resolvedArrayElements(
  expression: ts.Expression,
  context: AuditContext,
): ResolvedArrayElements {
  const value = unwrap(expression);
  if (tsCompiler.isArrayLiteralExpression(value)) {
    const elements: Array<ts.Expression | null> = [];
    const unresolved: string[] = [];
    for (const element of value.elements) {
      if (tsCompiler.isOmittedExpression(element)) {
        elements.push(null);
      } else if (tsCompiler.isSpreadElement(element)) {
        const spread = resolvedArrayElements(element.expression, context);
        elements.push(...spread.elements);
        unresolved.push(...spread.unresolved);
      } else {
        elements.push(element);
      }
    }
    return { elements, unresolved };
  }

  const local = localStaticExpression(value, context);
  if (!local || local.declarations.some((declaration) => context.resolving.has(declaration))) {
    const importedPath = importedSpreadPath(value, context);
    return {
      elements: [],
      unresolved: [importedPath ? `[import:${importedPath}]` : `[dynamic:${value.getText()}]`],
    };
  }
  if (local.unresolved?.length) return { elements: [], unresolved: local.unresolved };
  for (const declaration of local.declarations) context.resolving.add(declaration);
  const resolution = resolvedArrayElements(local.expression, context);
  for (const declaration of local.declarations) context.resolving.delete(declaration);
  return resolution;
}

function destructuredBindingExpression(
  binding: ts.BindingElement,
  context: AuditContext,
): ResolvedStaticExpression | null {
  if (binding.dotDotDotToken) return null;
  const pattern = binding.parent;
  if (!tsCompiler.isObjectBindingPattern(pattern) && !tsCompiler.isArrayBindingPattern(pattern)) {
    return null;
  }
  const source = bindingPatternSource(pattern, context);
  if (!source) return null;

  if (tsCompiler.isArrayBindingPattern(pattern)) {
    const index = pattern.elements.indexOf(binding);
    const resolution = resolvedArrayElements(source.expression, context);
    const expression = index >= 0 ? resolution.elements[index] : null;
    if (expression) {
      const value = unwrap(expression);
      const resolvedExpression =
        binding.initializer &&
        ((tsCompiler.isIdentifier(value) && value.text === "undefined") ||
          tsCompiler.isVoidExpression(value))
          ? binding.initializer
          : expression;
      return {
        declarations: [binding, ...source.declarations],
        expression: resolvedExpression,
      };
    }
    if (resolution.unresolved.length > 0) {
      return {
        additionalExpressions: binding.initializer ? [binding.initializer] : undefined,
        declarations: [binding, ...source.declarations],
        expression: source.expression,
        unresolved: resolution.unresolved.map((item) => unresolvedMemberPath(item, `${index}`)),
      };
    }
    return binding.initializer
      ? { declarations: [binding, ...source.declarations], expression: binding.initializer }
      : null;
  }

  const name = binding.propertyName
    ? propertyName(binding.propertyName)
    : tsCompiler.isIdentifier(binding.name)
      ? binding.name.text
      : null;
  if (!name) return null;
  const resolution = resolvedObjectProperties(source.expression, context);
  const propertyIndex = resolution.entries.findLastIndex((candidate) => {
    if (isUnresolvedObjectEntry(candidate)) return false;
    if (tsCompiler.isShorthandPropertyAssignment(candidate)) return candidate.name.text === name;
    return (
      (tsCompiler.isPropertyAssignment(candidate) ||
        tsCompiler.isMethodDeclaration(candidate) ||
        tsCompiler.isGetAccessorDeclaration(candidate)) &&
      propertyName(candidate.name) === name
    );
  });
  const unresolvedAfterProperty = resolution.entries
    .slice(propertyIndex + 1)
    .filter(isUnresolvedObjectEntry)
    .map((entry) => unresolvedMemberPath(entry.unresolved, name));
  if (unresolvedAfterProperty.length > 0) {
    return {
      additionalExpressions: binding.initializer ? [binding.initializer] : undefined,
      declarations: [binding, ...source.declarations],
      expression: source.expression,
      unresolved: unresolvedAfterProperty,
    };
  }
  const property = propertyIndex >= 0 ? resolution.entries[propertyIndex] : null;
  if (property && !isUnresolvedObjectEntry(property) && tsCompiler.isPropertyAssignment(property)) {
    const value = unwrap(property.initializer);
    const expression =
      binding.initializer &&
      ((tsCompiler.isIdentifier(value) && value.text === "undefined") ||
        tsCompiler.isVoidExpression(value))
        ? binding.initializer
        : property.initializer;
    return {
      declarations: [binding, ...source.declarations],
      expression,
    };
  }
  if (
    property &&
    !isUnresolvedObjectEntry(property) &&
    tsCompiler.isShorthandPropertyAssignment(property)
  ) {
    const declaration = shorthandStaticInitializer(property, context.checker);
    if (declaration?.initializer) {
      return {
        declarations: [binding, ...source.declarations, declaration],
        expression: declaration.initializer,
      };
    }
    if (isImportedShorthand(property, context.checker)) {
      return {
        additionalExpressions: binding.initializer ? [binding.initializer] : undefined,
        declarations: [binding, ...source.declarations],
        expression: property.name,
        unresolved: [`[import:${property.name.text}]`],
      };
    }
  }
  if (
    property &&
    !isUnresolvedObjectEntry(property) &&
    tsCompiler.isGetAccessorDeclaration(property)
  ) {
    const returned = returnedExpressions(property).map((expression) => {
      const value = unwrap(expression);
      return binding.initializer &&
        ((tsCompiler.isIdentifier(value) && value.text === "undefined") ||
          tsCompiler.isVoidExpression(value))
        ? binding.initializer
        : expression;
    });
    if (returned.length === 0 && binding.initializer) returned.push(binding.initializer);
    const [expression, ...additionalExpressions] = returned;
    if (expression) {
      return {
        additionalExpressions,
        declarations: [binding, ...source.declarations],
        expression,
      };
    }
  }
  if (!property && resolution.unresolved.length > 0) {
    return {
      additionalExpressions: binding.initializer ? [binding.initializer] : undefined,
      declarations: [binding, ...source.declarations],
      expression: source.expression,
      unresolved: resolution.unresolved.map((item) => unresolvedMemberPath(item, name)),
    };
  }
  return binding.initializer
    ? { declarations: [binding, ...source.declarations], expression: binding.initializer }
    : null;
}

function localStaticExpression(
  expression: ts.Expression,
  context: AuditContext,
): ResolvedStaticExpression | null {
  const value = unwrap(expression);
  if (tsCompiler.isIdentifier(value)) {
    const symbol = context.checker.getSymbolAtLocation(value);
    const symbolDeclaration = symbol?.declarations?.length === 1 ? symbol.declarations[0] : null;
    if (symbolDeclaration && tsCompiler.isBindingElement(symbolDeclaration)) {
      const resolved = destructuredBindingExpression(symbolDeclaration, context);
      if (resolved) return resolved;
    }
    const declaration = localStaticInitializer(value, context.checker);
    if (!declaration || context.resolving.has(declaration) || !declaration.initializer) return null;
    return { declarations: [declaration], expression: declaration.initializer };
  }

  if (
    !tsCompiler.isPropertyAccessExpression(value) &&
    !tsCompiler.isElementAccessExpression(value)
  ) {
    return null;
  }

  const name = tsCompiler.isPropertyAccessExpression(value)
    ? value.name.text
    : stringLiteralValue(value.argumentExpression);
  if (!name) return null;
  const ownerValue = unwrap(value.expression);
  const owner = tsCompiler.isObjectLiteralExpression(ownerValue)
    ? { declarations: [], expression: ownerValue }
    : localStaticExpression(ownerValue, context);
  if (!owner) return null;
  if (owner.unresolved?.length) {
    return {
      ...owner,
      unresolved: owner.unresolved.map((item) => unresolvedMemberPath(item, name)),
    };
  }
  return resolvedObjectMember(owner, name, context);
}

type UnresolvedObjectEntry = { unresolved: string };
type ResolvedObjectEntry = ts.ObjectLiteralElementLike | UnresolvedObjectEntry;

function isUnresolvedObjectEntry(entry: ResolvedObjectEntry): entry is UnresolvedObjectEntry {
  return "unresolved" in entry;
}

type ResolvedObjectProperties = {
  entries: ResolvedObjectEntry[];
  properties: ts.ObjectLiteralElementLike[];
  unresolved: string[];
};

function resolvedObjectProperties(
  expression: ts.Expression | undefined,
  context: AuditContext,
): ResolvedObjectProperties {
  if (!expression) return { entries: [], properties: [], unresolved: [] };
  const value = unwrap(expression);
  if (tsCompiler.isCallExpression(value)) {
    const fn = localCalledFunction(value.expression, context);
    if (fn && !context.resolving.has(fn)) {
      context.resolving.add(fn);
      const resolutions = returnedExpressions(fn).map((returned) =>
        resolvedObjectProperties(returned, context),
      );
      context.resolving.delete(fn);
      if (resolutions.length > 0) {
        return {
          entries: resolutions.flatMap((resolution) => resolution.entries),
          properties: resolutions.flatMap((resolution) => resolution.properties),
          unresolved: resolutions.flatMap((resolution) => resolution.unresolved),
        };
      }
    }
    const importedPath = importedSpreadPath(value, context);
    return {
      entries: [
        {
          unresolved: importedPath ? `[import:${importedPath}]` : `[dynamic:${value.getText()}]`,
        },
      ],
      properties: [],
      unresolved: [importedPath ? `[import:${importedPath}]` : `[dynamic:${value.getText()}]`],
    };
  }
  if (!tsCompiler.isObjectLiteralExpression(value)) {
    const local = localStaticExpression(value, context);
    if (!local || local.declarations.some((declaration) => context.resolving.has(declaration))) {
      const importedPath = importedSpreadPath(value, context);
      return {
        entries: [
          {
            unresolved: importedPath ? `[import:${importedPath}]` : `[dynamic:${value.getText()}]`,
          },
        ],
        properties: [],
        unresolved: [importedPath ? `[import:${importedPath}]` : `[dynamic:${value.getText()}]`],
      };
    }
    if (local.unresolved?.length) {
      return {
        entries: local.unresolved.map((unresolved) => ({ unresolved })),
        properties: [],
        unresolved: local.unresolved,
      };
    }
    for (const declaration of local.declarations) context.resolving.add(declaration);
    const resolutions = [local.expression, ...(local.additionalExpressions ?? [])].map((item) =>
      resolvedObjectProperties(item, context),
    );
    for (const declaration of local.declarations) context.resolving.delete(declaration);
    return {
      entries: resolutions.flatMap((resolution) => resolution.entries),
      properties: resolutions.flatMap((resolution) => resolution.properties),
      unresolved: resolutions.flatMap((resolution) => resolution.unresolved),
    };
  }

  const entries: ResolvedObjectEntry[] = [];
  const properties: ts.ObjectLiteralElementLike[] = [];
  const unresolved: string[] = [];
  for (const property of value.properties) {
    if (!tsCompiler.isSpreadAssignment(property)) {
      entries.push(property);
      properties.push(property);
      continue;
    }
    const spread = resolvedObjectProperties(property.expression, context);
    entries.push(...spread.entries);
    properties.push(...spread.properties);
    unresolved.push(...spread.unresolved);
  }
  return { entries, properties, unresolved };
}

function resolvedObjectMember(
  owner: ResolvedStaticExpression,
  name: string,
  context: AuditContext,
): ResolvedStaticExpression | null {
  const expressions: ts.Expression[] = [];
  const unresolved: string[] = [];
  const declarations = [...owner.declarations];

  for (const source of [owner.expression, ...(owner.additionalExpressions ?? [])]) {
    const resolution = resolvedObjectProperties(source, context);
    const propertyIndex = resolution.entries.findLastIndex((candidate) => {
      if (isUnresolvedObjectEntry(candidate)) return false;
      if (tsCompiler.isShorthandPropertyAssignment(candidate)) return candidate.name.text === name;
      return (
        (tsCompiler.isPropertyAssignment(candidate) ||
          tsCompiler.isGetAccessorDeclaration(candidate) ||
          tsCompiler.isMethodDeclaration(candidate)) &&
        propertyName(candidate.name) === name
      );
    });
    unresolved.push(
      ...resolution.entries
        .slice(propertyIndex + 1)
        .filter(isUnresolvedObjectEntry)
        .map((entry) => unresolvedMemberPath(entry.unresolved, name)),
    );
    const property = propertyIndex >= 0 ? resolution.entries[propertyIndex] : null;
    if (!property || isUnresolvedObjectEntry(property)) continue;
    if (tsCompiler.isPropertyAssignment(property)) {
      expressions.push(property.initializer);
    } else if (tsCompiler.isShorthandPropertyAssignment(property)) {
      const declaration = shorthandStaticInitializer(property, context.checker);
      if (declaration?.initializer) {
        declarations.push(declaration);
        expressions.push(declaration.initializer);
      } else if (isImportedShorthand(property, context.checker)) {
        unresolved.push(`[import:${property.name.text}]`);
      }
    } else if (tsCompiler.isGetAccessorDeclaration(property)) {
      expressions.push(...returnedExpressions(property));
    }
  }

  const [expression, ...additionalExpressions] = expressions;
  if (expression) {
    return {
      additionalExpressions,
      declarations,
      expression,
      unresolved: unresolved.length > 0 ? unresolved : undefined,
    };
  }
  return unresolved.length > 0
    ? {
        declarations,
        expression: owner.expression,
        unresolved,
      }
    : null;
}

function collectStaticText(
  expression: ts.Expression,
  context: AuditContext,
  output: string[],
): void {
  const value = unwrap(expression);
  if (tsCompiler.isIdentifier(value)) {
    const local = localStaticExpression(value, context);
    if (local?.declarations.every((declaration) => !context.resolving.has(declaration))) {
      if (local.unresolved?.length) {
        const binding = local.declarations.find((declaration) =>
          tsCompiler.isBindingElement(declaration),
        );
        const pattern = binding?.parent;
        const variable = pattern?.parent;
        const initializer =
          variable && tsCompiler.isVariableDeclaration(variable) && variable.initializer
            ? unwrap(variable.initializer)
            : null;
        const callee =
          initializer && tsCompiler.isCallExpression(initializer)
            ? unwrap(initializer.expression)
            : null;
        const isReactUseState = Boolean(
          pattern &&
            tsCompiler.isArrayBindingPattern(pattern) &&
            callee &&
            tsCompiler.isIdentifier(callee) &&
            context.checker
              .getSymbolAtLocation(callee)
              ?.declarations?.some(
                (declaration) =>
                  tsCompiler.isImportSpecifier(declaration) &&
                  (declaration.propertyName?.text ?? declaration.name.text) === "useState" &&
                  importSource(declaration) === "react",
              ),
        );
        if (isReactUseState && initializer && tsCompiler.isCallExpression(initializer)) {
          const initialValue = initializer.arguments[0];
          if (initialValue) collectStaticText(initialValue, context, output);
        } else if (!isReviewedAuthoredProducer(local.declarations, context.checker)) {
          output.push(...local.unresolved.filter(isUnresolvedFixedCopyCandidate));
        }
        for (const expression of local.additionalExpressions ?? []) {
          collectStaticText(expression, context, output);
        }
      } else {
        for (const declaration of local.declarations) context.resolving.add(declaration);
        for (const expression of [local.expression, ...(local.additionalExpressions ?? [])]) {
          collectStaticText(expression, context, output);
        }
        for (const declaration of local.declarations) context.resolving.delete(declaration);
      }
    } else if (isImportedIdentifier(value, context.checker)) {
      output.push(`[import:${value.text}]`);
    }
    return;
  }

  if (tsCompiler.isCallExpression(value)) {
    const fn = localCalledFunction(value.expression, context);
    if (fn && !context.resolving.has(fn)) {
      context.resolving.add(fn);
      for (const expression of returnedExpressions(fn))
        collectStaticText(expression, context, output);
      context.resolving.delete(fn);
    }
    return;
  }

  if (tsCompiler.isArrowFunction(value) || tsCompiler.isFunctionExpression(value)) {
    for (const expression of returnedExpressions(value))
      collectStaticText(expression, context, output);
    return;
  }

  const localMember = localStaticExpression(value, context);
  if (localMember?.declarations.every((item) => !context.resolving.has(item))) {
    for (const declaration of localMember.declarations) context.resolving.add(declaration);
    if (
      localMember.unresolved?.length &&
      !isReviewedAuthoredProducer(localMember.declarations, context.checker)
    ) {
      output.push(...localMember.unresolved.filter(isUnresolvedFixedCopyCandidate));
    }
    for (const expression of [
      localMember.expression,
      ...(localMember.additionalExpressions ?? []),
    ]) {
      collectStaticText(expression, context, output);
    }
    for (const declaration of localMember.declarations) context.resolving.delete(declaration);
    return;
  }

  const importedPath = importedExpressionPath(value, context.checker);
  if (importedPath) {
    output.push(`[import:${importedPath}]`);
    return;
  }

  const literal = stringLiteralValue(value);
  if (literal !== null) {
    if (isAuditableText(literal)) output.push(normalizeText(literal));
    return;
  }

  if (tsCompiler.isTemplateExpression(value)) {
    if (isAuditableText(value.head.text)) output.push(normalizeText(value.head.text));
    for (const span of value.templateSpans) {
      collectStaticText(span.expression, context, output);
      if (isAuditableText(span.literal.text)) output.push(normalizeText(span.literal.text));
    }
    return;
  }

  if (tsCompiler.isConditionalExpression(value)) {
    collectStaticText(value.whenTrue, context, output);
    collectStaticText(value.whenFalse, context, output);
    return;
  }

  if (tsCompiler.isBinaryExpression(value)) {
    if (value.operatorToken.kind === tsCompiler.SyntaxKind.AmpersandAmpersandToken) {
      collectStaticText(value.right, context, output);
      return;
    }
    if (
      value.operatorToken.kind === tsCompiler.SyntaxKind.PlusToken ||
      value.operatorToken.kind === tsCompiler.SyntaxKind.BarBarToken ||
      value.operatorToken.kind === tsCompiler.SyntaxKind.QuestionQuestionToken
    ) {
      collectStaticText(value.left, context, output);
      collectStaticText(value.right, context, output);
    }
    return;
  }

  if (tsCompiler.isArrayLiteralExpression(value)) {
    for (const element of value.elements) {
      if (tsCompiler.isOmittedExpression(element)) continue;
      collectStaticText(
        tsCompiler.isSpreadElement(element) ? element.expression : element,
        context,
        output,
      );
    }
  }
}

function jsxAttributeExpression(attribute: ts.JsxAttribute): ts.Expression | undefined {
  const initializer = attribute.initializer;
  if (!initializer) return undefined;
  if (tsCompiler.isStringLiteral(initializer)) return initializer;
  return tsCompiler.isJsxExpression(initializer) ? initializer.expression : undefined;
}

function propertyName(name: ts.PropertyName): string | null {
  if (
    tsCompiler.isIdentifier(name) ||
    tsCompiler.isStringLiteral(name) ||
    tsCompiler.isNumericLiteral(name)
  ) {
    return name.text;
  }
  return tsCompiler.isComputedPropertyName(name) ? stringLiteralValue(name.expression) : null;
}

function calledMethodName(expression: ts.Expression): string | null {
  const value = unwrap(expression);
  if (tsCompiler.isPropertyAccessExpression(value)) return value.name.text;
  return tsCompiler.isElementAccessExpression(value)
    ? stringLiteralValue(value.argumentExpression)
    : null;
}

type ToastCopySink =
  | { kind: "promise"; options: ts.Expression | undefined }
  | {
      kind: "message";
      label: string;
      message: ts.Expression | undefined;
      options: ts.Expression | undefined;
    };

function toastCopySink(node: ts.CallExpression, context: AuditContext): ToastCopySink | null {
  const value = unwrap(node.expression);
  if (isSonnerToastExpression(value, context)) {
    return {
      kind: "message",
      label: "message",
      message: node.arguments[0],
      options: node.arguments[1],
    };
  }
  if (
    !tsCompiler.isPropertyAccessExpression(value) &&
    !tsCompiler.isElementAccessExpression(value)
  ) {
    return null;
  }
  const method = calledMethodName(value);
  if (!method || !isSonnerToastExpression(value.expression, context)) return null;
  if (method === "promise") return { kind: "promise", options: node.arguments[1] };
  return TOAST_COPY_METHODS.has(method)
    ? {
        kind: "message",
        label: method,
        message: node.arguments[0],
        options: node.arguments[1],
      }
    : null;
}

function isDirectIntlDateFormatter(
  expression: ts.Expression,
  context: AuditContext,
  resolving = new Set<StaticDeclaration>(),
): boolean {
  const value = unwrap(expression);
  if (tsCompiler.isPropertyAccessExpression(value) || tsCompiler.isElementAccessExpression(value)) {
    const owner = unwrap(value.expression);
    if (
      tsCompiler.isIdentifier(owner) &&
      owner.text === "Intl" &&
      calledMethodName(value) === "DateTimeFormat"
    ) {
      return true;
    }
  }
  if (tsCompiler.isIdentifier(value)) {
    const declaration = localStaticInitializer(value, context.checker);
    if (!declaration || resolving.has(declaration) || !declaration.initializer) return false;
    resolving.add(declaration);
    const result = isDirectIntlDateFormatter(declaration.initializer, context, resolving);
    resolving.delete(declaration);
    return result;
  }

  const localMember = localStaticExpression(value, context);
  if (!localMember || localMember.declarations.some((item) => resolving.has(item))) return false;
  for (const declaration of localMember.declarations) resolving.add(declaration);
  const result = isDirectIntlDateFormatter(localMember.expression, context, resolving);
  for (const declaration of localMember.declarations) resolving.delete(declaration);
  return result;
}

function createBoundSource(filePath: string, sourceText: string) {
  const sourceFile = tsCompiler.createSourceFile(
    filePath,
    sourceText,
    tsCompiler.ScriptTarget.Latest,
    true,
    tsCompiler.ScriptKind.TSX,
  );
  const options: ts.CompilerOptions = {
    jsx: tsCompiler.JsxEmit.Preserve,
    noLib: true,
    noResolve: true,
    target: tsCompiler.ScriptTarget.Latest,
  };
  const host: ts.CompilerHost = {
    fileExists: (candidate) => candidate === filePath,
    getCanonicalFileName: (candidate) => candidate,
    getCurrentDirectory: () => process.cwd(),
    getDefaultLibFileName: () => "",
    getNewLine: () => "\n",
    getSourceFile: (candidate) => (candidate === filePath ? sourceFile : undefined),
    readFile: (candidate) => (candidate === filePath ? sourceText : undefined),
    useCaseSensitiveFileNames: () => true,
    writeFile: () => undefined,
  };
  const program = tsCompiler.createProgram([filePath], options, host);
  const boundSource = program.getSourceFile(filePath);
  if (!boundSource) throw new Error(`Unable to bind ${filePath}`);
  return { checker: program.getTypeChecker(), sourceFile: boundSource };
}

function auditSource(filePath: string, sourceText: string): Diagnostic[] {
  const { checker, sourceFile } = createBoundSource(filePath, sourceText);
  const diagnostics: Diagnostic[] = [];
  const report = (node: ts.Node, category: string, detail: string) => {
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
    diagnostics.push({ category, detail, filePath, line: line + 1 });
  };
  const staticText = (expression: ts.Expression | undefined) => {
    if (!expression) return [];
    const output: string[] = [];
    collectStaticText(expression, { checker, resolving: new Set() }, output);
    return output;
  };
  const objectPropertyName = (property: ts.ObjectLiteralElementLike) => {
    if (tsCompiler.isShorthandPropertyAssignment(property)) return property.name.text;
    return tsCompiler.isPropertyAssignment(property) ||
      tsCompiler.isGetAccessorDeclaration(property) ||
      tsCompiler.isMethodDeclaration(property)
      ? propertyName(property.name)
      : null;
  };
  const objectPropertyExpressions = (property: ts.ObjectLiteralElementLike) => {
    if (tsCompiler.isPropertyAssignment(property)) return [property.initializer];
    if (tsCompiler.isShorthandPropertyAssignment(property)) {
      const initializer = shorthandStaticInitializer(property, checker)?.initializer;
      if (initializer) return [initializer];
      const fn = shorthandFunctionDeclaration(property, checker);
      return fn ? returnedExpressions(fn) : [];
    }
    if (tsCompiler.isGetAccessorDeclaration(property) || tsCompiler.isMethodDeclaration(property)) {
      return returnedExpressions(property);
    }
    return [];
  };
  const objectPropertyText = (property: ts.ObjectLiteralElementLike) => {
    const expressions = objectPropertyExpressions(property);
    if (expressions.length > 0) {
      return expressions.flatMap((expression) => staticText(expression));
    }
    return tsCompiler.isShorthandPropertyAssignment(property) &&
      isImportedShorthand(property, checker)
      ? [`[import:${property.name.text}]`]
      : [];
  };
  const isUseI18nImport = (identifier: ts.Identifier) => {
    const symbol = checker.getSymbolAtLocation(identifier);
    return Boolean(
      symbol?.declarations?.some(
        (declaration) =>
          tsCompiler.isImportSpecifier(declaration) &&
          (declaration.propertyName?.text ?? declaration.name.text) === "useI18n" &&
          (importSource(declaration) === "@/i18n" ||
            (importSource(declaration) === "." && filePath.startsWith("src/i18n/"))),
      ),
    );
  };
  const isCatalogBinding = (identifier: ts.Identifier) => {
    const symbol = checker.getSymbolAtLocation(identifier);
    if (!symbol) return false;
    if (symbol.declarations?.length !== 1) return false;
    const declaration = symbol.declarations[0];
    if (!declaration || !tsCompiler.isBindingElement(declaration)) return false;
    const boundName = declaration.propertyName
      ? propertyName(declaration.propertyName)
      : tsCompiler.isIdentifier(declaration.name)
        ? declaration.name.text
        : null;
    const pattern = declaration.parent;
    const variable = pattern.parent;
    if (
      boundName !== "t" ||
      !tsCompiler.isObjectBindingPattern(pattern) ||
      !tsCompiler.isVariableDeclaration(variable) ||
      !variable.initializer
    ) {
      return false;
    }
    const initializer = unwrap(variable.initializer);
    const callee = tsCompiler.isCallExpression(initializer) ? unwrap(initializer.expression) : null;
    return Boolean(callee && tsCompiler.isIdentifier(callee) && isUseI18nImport(callee));
  };
  const isCatalogCall = (node: ts.CallExpression) => {
    const callee = unwrap(node.expression);
    return tsCompiler.isIdentifier(callee) && isCatalogBinding(callee);
  };
  const unresolvedToastValue = (
    expression: ts.Expression,
    context: AuditContext,
    output: string[],
  ): void => {
    const value = unwrap(expression);
    if (tsCompiler.isIdentifier(value)) {
      const local = localStaticExpression(value, context);
      if (local?.declarations.every((declaration) => !context.resolving.has(declaration))) {
        if (local.unresolved?.length) {
          output.push(...local.unresolved);
          return;
        }
        for (const declaration of local.declarations) context.resolving.add(declaration);
        for (const expression of [local.expression, ...(local.additionalExpressions ?? [])]) {
          unresolvedToastValue(expression, context, output);
        }
        for (const declaration of local.declarations) context.resolving.delete(declaration);
      } else if (isImportedIdentifier(value, checker)) {
        output.push(`[import:${value.text}]`);
      }
      return;
    }
    if (tsCompiler.isCallExpression(value)) {
      if (isCatalogCall(value)) return;
      const fn = localCalledFunction(value.expression, context);
      if (fn && !context.resolving.has(fn)) {
        context.resolving.add(fn);
        for (const returned of returnedExpressions(fn)) {
          unresolvedToastValue(returned, context, output);
        }
        context.resolving.delete(fn);
        return;
      }
      const importedPath = importedSpreadPath(value, context);
      output.push(
        importedPath ? `[import:${importedPath}]` : `[dynamic:${value.expression.getText()}()]`,
      );
      return;
    }
    if (tsCompiler.isArrowFunction(value) || tsCompiler.isFunctionExpression(value)) {
      for (const returned of returnedExpressions(value)) {
        unresolvedToastValue(returned, context, output);
      }
      return;
    }

    const local = localStaticExpression(value, context);
    if (local?.declarations.every((declaration) => !context.resolving.has(declaration))) {
      if (local.unresolved?.length) {
        output.push(...local.unresolved);
        return;
      }
      for (const declaration of local.declarations) context.resolving.add(declaration);
      for (const expression of [local.expression, ...(local.additionalExpressions ?? [])]) {
        unresolvedToastValue(expression, context, output);
      }
      for (const declaration of local.declarations) context.resolving.delete(declaration);
      return;
    }
    const importedPath = importedExpressionPath(value, checker);
    if (importedPath) {
      output.push(`[import:${importedPath}]`);
      return;
    }
    if (tsCompiler.isTemplateExpression(value)) {
      for (const span of value.templateSpans) {
        unresolvedToastValue(span.expression, context, output);
      }
      return;
    }
    if (tsCompiler.isConditionalExpression(value)) {
      unresolvedToastValue(value.whenTrue, context, output);
      unresolvedToastValue(value.whenFalse, context, output);
      return;
    }
    if (tsCompiler.isBinaryExpression(value)) {
      unresolvedToastValue(value.left, context, output);
      unresolvedToastValue(value.right, context, output);
      return;
    }
    if (tsCompiler.isArrayLiteralExpression(value)) {
      for (const element of value.elements) {
        if (!tsCompiler.isOmittedExpression(element)) {
          unresolvedToastValue(
            tsCompiler.isSpreadElement(element) ? element.expression : element,
            context,
            output,
          );
        }
      }
    }
  };
  const unresolvedToastProperty = (property: ts.ObjectLiteralElementLike) => {
    if (
      tsCompiler.isShorthandPropertyAssignment(property) &&
      isImportedShorthand(property, checker)
    ) {
      return [`[import:${property.name.text}]`];
    }
    const output: string[] = [];
    for (const expression of objectPropertyExpressions(property)) {
      unresolvedToastValue(expression, { checker, resolving: new Set() }, output);
    }
    return [...new Set(output)];
  };
  const toastOptionElements = new Set<ts.ObjectLiteralElementLike>();
  const collectToastOptionElements = (node: ts.Node) => {
    if (tsCompiler.isCallExpression(node)) {
      const sink = toastCopySink(node, { checker, resolving: new Set() });
      const resolution = resolvedObjectProperties(sink?.options, {
        checker,
        resolving: new Set(),
      });
      const allowed =
        sink?.kind === "promise" ? TOAST_PROMISE_COPY_PROPERTIES : TOAST_OPTION_COPY_PROPERTIES;
      for (const property of resolution.properties) {
        const name = objectPropertyName(property);
        if (name && allowed.has(name)) toastOptionElements.add(property);
      }
    }
    tsCompiler.forEachChild(node, collectToastOptionElements);
  };
  collectToastOptionElements(sourceFile);

  const visit = (node: ts.Node) => {
    if (tsCompiler.isJsxText(node) && isAuditableText(node.text)) {
      report(node, "jsx-text", JSON.stringify(normalizeText(node.text)));
    }

    if (tsCompiler.isJsxExpression(node) && !tsCompiler.isJsxAttribute(node.parent)) {
      const text = staticText(node.expression);
      if (text.length > 0) report(node, "jsx-expression", JSON.stringify(text));
    }

    if (tsCompiler.isJsxAttribute(node)) {
      const name = node.name.getText(sourceFile);
      if (AUDITED_ATTRIBUTES.has(name)) {
        const text = staticText(jsxAttributeExpression(node));
        if (text.length > 0) report(node, "literal-attribute", `${name}=${JSON.stringify(text)}`);
      }
    }

    if (tsCompiler.isJsxSpreadAttribute(node)) {
      const importedPath = importedSpreadPath(node.expression, {
        checker,
        resolving: new Set(),
      });
      if (importedPath) report(node, "unresolved-ui-spread", `[import:${importedPath}]`);
    }

    if (
      tsCompiler.isPropertyAssignment(node) ||
      tsCompiler.isShorthandPropertyAssignment(node) ||
      tsCompiler.isGetAccessorDeclaration(node) ||
      tsCompiler.isMethodDeclaration(node)
    ) {
      const name = objectPropertyName(node);
      if (name && AUDITED_ATTRIBUTES.has(name)) {
        const text = objectPropertyText(node);
        if (text.length > 0) {
          if (!toastOptionElements.has(node)) {
            report(node, "literal-object-property", `${name}=${JSON.stringify(text)}`);
          }
        }
      }
    }

    if (tsCompiler.isCallExpression(node)) {
      const method = calledMethodName(node.expression);
      if (method && DIRECT_LOCALE_METHODS.has(method)) {
        report(node, "direct-locale-format", `${method} bypasses the shared locale formatter`);
      }
      const toastSink = toastCopySink(node, { checker, resolving: new Set() });
      if (toastSink?.kind === "message") {
        if (toastSink.message) {
          const unresolved: string[] = [];
          unresolvedToastValue(toastSink.message, { checker, resolving: new Set() }, unresolved);
          for (const detail of new Set(unresolved)) {
            report(node, "unresolved-toast-message", `${toastSink.label}=${detail}`);
          }
        }
        const text = staticText(toastSink.message);
        if (text.length > 0) {
          report(node, "literal-toast", `${toastSink.label}=${JSON.stringify(text)}`);
        }
        const resolution = resolvedObjectProperties(toastSink.options, {
          checker,
          resolving: new Set(),
        });
        for (const unresolved of resolution.unresolved) {
          report(node, "unresolved-toast-options", `${toastSink.label}=${unresolved}`);
        }
        for (const property of resolution.properties) {
          const name = objectPropertyName(property);
          if (!name || !TOAST_OPTION_COPY_PROPERTIES.has(name)) continue;
          const unresolved = unresolvedToastProperty(property);
          if (unresolved.length > 0) {
            for (const detail of unresolved) {
              report(property, "unresolved-toast-options", `${toastSink.label}.${name}=${detail}`);
            }
            continue;
          }
          const text = objectPropertyText(property);
          if (text.length > 0) {
            report(property, "literal-toast", `${name}=${JSON.stringify(text)}`);
          }
        }
      } else if (toastSink?.kind === "promise") {
        const resolution = resolvedObjectProperties(toastSink.options, {
          checker,
          resolving: new Set(),
        });
        for (const unresolved of resolution.unresolved) {
          report(node, "unresolved-toast-options", `promise=${unresolved}`);
        }
        for (const property of resolution.properties) {
          const name = objectPropertyName(property);
          if (!name || !TOAST_PROMISE_COPY_PROPERTIES.has(name)) continue;
          const unresolved = unresolvedToastProperty(property);
          if (unresolved.length > 0) {
            for (const detail of unresolved) {
              report(property, "unresolved-toast-options", `promise.${name}=${detail}`);
            }
            continue;
          }
          const text = objectPropertyText(property);
          if (text.length > 0) {
            report(property, "literal-toast", `promise.${name}=${JSON.stringify(text)}`);
          }
        }
      }
      if (isDirectIntlDateFormatter(node.expression, { checker, resolving: new Set() })) {
        report(node, "direct-intl-date-format", "use the shared locale formatter");
      }
    }

    if (
      tsCompiler.isNewExpression(node) &&
      isDirectIntlDateFormatter(node.expression, { checker, resolving: new Set() })
    ) {
      report(node, "direct-intl-date-format", "use the shared locale formatter");
    }

    if (tsCompiler.isArrowFunction(node) && !tsCompiler.isBlock(node.body)) {
      const name = exportedFunctionName(node);
      if (name && !isReviewedNonUiReturn(filePath, name)) {
        const text = staticText(node.body);
        if (text.length > 0) report(node.body, "literal-export-return", JSON.stringify(text));
      }
    }

    if (tsCompiler.isReturnStatement(node) && node.expression) {
      const fn = enclosingAuditedFunction(node);
      const name = fn ? exportedFunctionName(fn) : null;
      if (name && !isReviewedNonUiReturn(filePath, name)) {
        const text = staticText(node.expression);
        if (text.length > 0) report(node, "literal-export-return", JSON.stringify(text));
      }
    }

    tsCompiler.forEachChild(node, visit);
  };

  visit(sourceFile);
  return diagnostics;
}

function productionSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name))
    .flatMap((entry) => {
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) return entry.name === "test" ? [] : productionSourceFiles(entryPath);
      if (!entry.isFile() || entry.name.endsWith(".d.ts")) return [];
      return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [entryPath] : [];
    });
}

function formatDiagnostic(diagnostic: Diagnostic): string {
  return `${diagnostic.filePath}:${diagnostic.line}: ${diagnostic.category}: ${diagnostic.detail}`;
}

function auditProductionUi(): string[] {
  const repositoryRoot = process.cwd();
  const files = [
    ...PRODUCTION_SOURCE_ROOTS.flatMap((root) =>
      productionSourceFiles(path.join(repositoryRoot, root)),
    ),
  ];
  return files
    .flatMap((absolutePath) => {
      const filePath = path.relative(repositoryRoot, absolutePath).split(path.sep).join("/");
      return auditSource(filePath, readFileSync(absolutePath, "utf8"));
    })
    .sort(
      (left, right) =>
        left.filePath.localeCompare(right.filePath) ||
        left.line - right.line ||
        left.category.localeCompare(right.category),
    )
    .map(formatDiagnostic);
}

describe("catalog-only production UI audit", () => {
  it("detects fixed interface copy and locale-dependent formatting outside the shared boundary", () => {
    const diagnostics = auditSource(
      "fixture.tsx",
      `
        export function Fixture() {
          const buttonTitle = 'Open details';
          const metadata = { description: 'Fixed metadata' };
          const Formatter = Intl.DateTimeFormat;
          return <section>
            Fixed interface copy
            <button title={buttonTitle} aria-label={'Open panel'} />
            <p>{\`Welcome \${name}\`}</p>
            <time>{new Intl.DateTimeFormat(locale).format(date)}</time>
            <time>{Intl.DateTimeFormat(locale).format(date)}</time>
            <time>{new Intl['DateTimeFormat'](locale).format(date)}</time>
            <time>{new Formatter(locale).format(date)}</time>
            <time>{date.toLocaleTimeString()}</time>
            <time>{date.toLocaleDateString(locale)}</time>
          </section>;
        }
      `,
    ).map(formatDiagnostic);

    expect(diagnostics).toEqual([
      'fixture.tsx:4: literal-object-property: description=["Fixed metadata"]',
      'fixture.tsx:7: jsx-text: "Fixed interface copy"',
      'fixture.tsx:8: literal-attribute: title=["Open details"]',
      'fixture.tsx:8: literal-attribute: aria-label=["Open panel"]',
      'fixture.tsx:9: jsx-expression: ["Welcome"]',
      "fixture.tsx:10: direct-intl-date-format: use the shared locale formatter",
      "fixture.tsx:11: direct-intl-date-format: use the shared locale formatter",
      "fixture.tsx:12: direct-intl-date-format: use the shared locale formatter",
      "fixture.tsx:13: direct-intl-date-format: use the shared locale formatter",
      "fixture.tsx:14: direct-locale-format: toLocaleTimeString bypasses the shared locale formatter",
      "fixture.tsx:15: direct-locale-format: toLocaleDateString bypasses the shared locale formatter",
    ]);
  });

  it("detects fixed copy in display and accessibility props", () => {
    const diagnostics = auditSource(
      "fixture.tsx",
      `
        export function Fixture() {
          const spreadProps = { 'aria-label': 'Open details' };
          return <>
            <EmptyState description="No sessions yet" emptyText={'Nothing recorded'} />
            <meter
              aria-valuetext="3 sessions"
              aria-description={'Weekly progress'}
              aria-roledescription="Training progress"
            />
            <button {...spreadProps} />
            <Toaster containerAriaLabel="Notifications" />
            <Sheet closeLabel="Close sheet" />
          </>;
        }
      `,
    ).map(formatDiagnostic);

    expect(diagnostics).toEqual([
      'fixture.tsx:3: literal-object-property: aria-label=["Open details"]',
      'fixture.tsx:5: literal-attribute: description=["No sessions yet"]',
      'fixture.tsx:5: literal-attribute: emptyText=["Nothing recorded"]',
      'fixture.tsx:7: literal-attribute: aria-valuetext=["3 sessions"]',
      'fixture.tsx:8: literal-attribute: aria-description=["Weekly progress"]',
      'fixture.tsx:9: literal-attribute: aria-roledescription=["Training progress"]',
      'fixture.tsx:12: literal-attribute: containerAriaLabel=["Notifications"]',
      'fixture.tsx:13: literal-attribute: closeLabel=["Close sheet"]',
    ]);
  });

  it("detects copy flowing from a parameter default or unresolved import into a UI sink", () => {
    const diagnostics = auditSource(
      "fixture.tsx",
      `
        import labels, { closeProps, importedLabel, makeCloseProps } from './copy';
        import * as placeholders from './placeholders';
        const localLabels = { close: 'Local close' };
        export function Panel({ closeLabel = 'Close' }) {
          return <button
            aria-label={closeLabel}
            title={importedLabel}
            description={labels.description}
            placeholder={placeholders.search}
            text={localLabels.close}
          />;
        }
        export function PlainParameter(label = 'Plain close') {
          return <>
            <button aria-label={label} />
            <button {...closeProps} />
            <button {...makeCloseProps()} />
          </>;
        }
      `,
    ).map(formatDiagnostic);

    expect(diagnostics).toEqual([
      'fixture.tsx:7: literal-attribute: aria-label=["Close"]',
      'fixture.tsx:8: literal-attribute: title=["[import:importedLabel]"]',
      'fixture.tsx:9: literal-attribute: description=["[import:labels.description]"]',
      'fixture.tsx:10: literal-attribute: placeholder=["[import:placeholders.search]"]',
      'fixture.tsx:11: literal-attribute: text=["Local close"]',
      'fixture.tsx:16: literal-attribute: aria-label=["Plain close"]',
      "fixture.tsx:17: unresolved-ui-spread: [import:closeProps]",
      "fixture.tsx:18: unresolved-ui-spread: [import:makeCloseProps()]",
    ]);
  });

  it("detects copy flowing through local object and array destructuring", () => {
    const diagnostics = auditSource(
      "fixture.tsx",
      `
        const labels = { close: 'Object close' };
        const { close } = labels;
        const orderedLabels = ['Array close'];
        const [firstLabel] = orderedLabels;
        const nestedLabels = { dialog: { close: 'Nested close' } };
        const { dialog: { close: nestedClose } } = nestedLabels;
        const getterLabels = {
          get close() { if (ready) return record.close; return 'Getter close'; },
          get dialog() { return { title: 'Nested getter title' }; },
          get text() { if (ready) return 'Getter first'; return record.text; },
          get subtitle() { return undefined; },
        };
        const {
          close: getterClose,
          dialog: { title: getterTitle },
          text: getterText,
          subtitle: getterSubtitle = 'Getter default',
        } = getterLabels;
        export function Panel() {
          return <button
            aria-label={close}
            title={firstLabel}
            description={nestedClose}
            label={getterClose}
            text={getterTitle}
            emptyText={getterText}
            subtitle={getterSubtitle}
          />;
        }
      `,
    ).map(formatDiagnostic);

    expect(diagnostics).toEqual([
      'fixture.tsx:10: literal-object-property: title=["Nested getter title"]',
      'fixture.tsx:11: literal-object-property: text=["Getter first"]',
      'fixture.tsx:22: literal-attribute: aria-label=["Object close"]',
      'fixture.tsx:23: literal-attribute: title=["Array close"]',
      'fixture.tsx:24: literal-attribute: description=["Nested close"]',
      'fixture.tsx:25: literal-attribute: label=["Getter close"]',
      'fixture.tsx:26: literal-attribute: text=["Nested getter title"]',
      'fixture.tsx:27: literal-attribute: emptyText=["Getter first"]',
      'fixture.tsx:28: literal-attribute: subtitle=["Getter default"]',
    ]);
  });

  it("preserves imported provenance through object and array destructuring defaults", () => {
    const diagnostics = auditSource(
      "fixture.tsx",
      `
        import { labels, orderedLabels } from './copy';
        const { close = 'Fallback close' } = labels;
        const [title = 'Fallback title'] = orderedLabels;
        export function Panel() {
          return <button aria-label={close} title={title} />;
        }
      `,
    ).map(formatDiagnostic);

    expect(diagnostics).toEqual([
      'fixture.tsx:6: literal-attribute: aria-label=["[import:labels.close]","Fallback close"]',
      'fixture.tsx:6: literal-attribute: title=["[import:orderedLabels.0]","Fallback title"]',
    ]);
  });

  it("preserves imported and dynamic factory provenance through destructuring", () => {
    const diagnostics = auditSource(
      "fixture.tsx",
      `
        import { makeLabels } from './copy';
        const { close } = makeLabels();
        const [title] = makeDynamicLabels();
        export function Panel() {
          return <button aria-label={close} title={title} />;
        }
      `,
    ).map(formatDiagnostic);

    expect(diagnostics).toEqual([
      'fixture.tsx:6: literal-attribute: aria-label=["[import:makeLabels().close]"]',
      'fixture.tsx:6: literal-attribute: title=["[dynamic:makeDynamicLabels().0]"]',
    ]);
  });

  it("requires exact module provenance for reviewed authored producers", () => {
    const diagnostics = auditSource(
      "fixture.tsx",
      `
        import { useDog as approvedDog } from '@/lib/dogs';
        import { useDog as spoofedDog } from 'third-party';
        const approvedHook = approvedDog;
        const { name: approvedName } = approvedHook();
        const { humanText } = spoofedDog();
        export function Panel() {
          return <><span>{approvedName}</span><button aria-label={humanText} /></>;
        }
      `,
    ).map(formatDiagnostic);

    expect(diagnostics).toEqual([
      'fixture.tsx:8: literal-attribute: aria-label=["[import:spoofedDog().humanText]"]',
    ]);
  });

  it("requires reviewed producers to be called before trusting their output", () => {
    const diagnostics = auditSource(
      "fixture.tsx",
      `
        import { useDog } from '@/lib/dogs';
        const labels = useDog as typeof useDog & { close: string };
        labels.close = 'Close';
        const { close } = labels;
        export function Panel() {
          return <button aria-label={close} />;
        }
      `,
    ).map(formatDiagnostic);

    expect(diagnostics).toEqual([
      'fixture.tsx:7: literal-attribute: aria-label=["[import:useDog.close]"]',
    ]);
  });

  it("traces exact reviewed producers through namespace and frozen object-member aliases", () => {
    const diagnostics = auditSource(
      "fixture.tsx",
      `
        import * as dogs from '@/lib/dogs';
        import { useDog } from '@/lib/dogs';
        const api = Object.freeze({ useDog });
        const hook = api.useDog;
        const { name: namespaceName } = dogs.useDog();
        const { name: objectAliasName } = hook();
        export function Panel() {
          return <><span>{namespaceName}</span><span>{objectAliasName}</span></>;
        }
      `,
    ).map(formatDiagnostic);

    expect(diagnostics).toEqual([]);
  });

  it("fails closed when a mutable object member replaces a reviewed producer", () => {
    const diagnostics = auditSource(
      "fixture.tsx",
      `
        import { useDog } from '@/lib/dogs';
        const api = { useDog };
        api.useDog = (() => ({ humanText: 'Close' })) as typeof useDog;
        const { humanText } = api.useDog();
        export function Panel() {
          return <button aria-label={humanText} />;
        }
      `,
    ).map(formatDiagnostic);

    expect(diagnostics).toEqual([
      'fixture.tsx:7: literal-attribute: aria-label=["[dynamic:api.useDog().humanText]"]',
    ]);
  });

  it("does not trust a locally shadowed Object.freeze", () => {
    const diagnostics = auditSource(
      "fixture.tsx",
      `
        import { useDog } from '@/lib/dogs';
        const Object = { freeze: <Value,>(value: Value) => value };
        const api = Object.freeze({ useDog });
        api.useDog = (() => ({ humanText: 'Close' })) as typeof useDog;
        const { humanText } = api.useDog();
        export function Panel() {
          return <button aria-label={humanText} />;
        }
      `,
    ).map(formatDiagnostic);

    expect(diagnostics).toEqual([
      'fixture.tsx:8: literal-attribute: aria-label=["[dynamic:api.useDog().humanText]"]',
    ]);
  });

  it("audits defaults from approved authored producers", () => {
    const diagnostics = auditSource(
      "fixture.tsx",
      `
        import { useDog } from '@/lib/dogs';
        const { label = 'Approved fallback' } = useDog();
        export function Panel() {
          return <button aria-label={label} />;
        }
      `,
    ).map(formatDiagnostic);

    expect(diagnostics).toEqual([
      'fixture.tsx:5: literal-attribute: aria-label=["Approved fallback"]',
    ]);
  });

  it("respects unresolved spread override order during destructuring", () => {
    const diagnostics = auditSource(
      "fixture.tsx",
      `
        import { importedLabels } from './copy';
        const safe = { ...importedLabels, close: record.close };
        const unsafe = { close: record.close, ...importedLabels };
        const { close: safeClose } = safe;
        const { close: unsafeClose } = unsafe;
        export function Panel() {
          return <><button aria-label={safeClose} /><button title={unsafeClose} /></>;
        }
      `,
    ).map(formatDiagnostic);

    expect(diagnostics).toEqual([
      'fixture.tsx:8: literal-attribute: title=["[import:importedLabels.close]"]',
    ]);
  });

  it("detects literal and lazy-literal React state initializers at UI sinks", () => {
    const diagnostics = auditSource(
      "fixture.tsx",
      `
        import { useState } from 'react';
        const [label] = useState('State close');
        const [title] = useState(() => 'Lazy state title');
        export function Panel() {
          return <button aria-label={label} title={title} />;
        }
      `,
    ).map(formatDiagnostic);

    expect(diagnostics).toEqual([
      'fixture.tsx:6: literal-attribute: aria-label=["State close"]',
      'fixture.tsx:6: literal-attribute: title=["Lazy state title"]',
    ]);
  });

  it("detects an imported JSX spread through a local alias", () => {
    const diagnostics = auditSource(
      "fixture.tsx",
      `
        import { closeProps } from './copy';
        const aliasedCloseProps = closeProps;
        const nestedCloseProps = { ...closeProps };
        export function Panel() {
          return <><button {...aliasedCloseProps} /><button {...nestedCloseProps} /></>;
        }
      `,
    ).map(formatDiagnostic);

    expect(diagnostics).toEqual([
      "fixture.tsx:6: unresolved-ui-spread: [import:closeProps]",
      "fixture.tsx:6: unresolved-ui-spread: [import:closeProps]",
    ]);
  });

  it("detects fixed copy returned by a non-exported helper at UI sinks", () => {
    const diagnostics = auditSource(
      "fixture.tsx",
      `
        function closeLabel() {
          return 'Local helper close';
        }
        const tooltip = () => 'Arrow helper tooltip';
        const labels = {
          close: () => 'Member helper close',
          open() { return 'Method helper open'; },
        };
        const getterLabels = {
          get close() { if (ready) return record.close; return 'Getter member close'; },
          get dialog() { if (ready) return record.dialog; return { close: 'Chained getter close' }; },
        };
        export function Panel() {
          return <>
            <button aria-label={closeLabel()} title={tooltip()} />
            <button aria-label={labels.close()} title={labels.open()} />
            <button text={getterLabels.close} label={getterLabels.dialog.close} />
            {closeLabel()}
          </>;
        }
      `,
    ).map(formatDiagnostic);

    expect(diagnostics).toEqual([
      'fixture.tsx:16: literal-attribute: aria-label=["Local helper close"]',
      'fixture.tsx:16: literal-attribute: title=["Arrow helper tooltip"]',
      'fixture.tsx:17: literal-attribute: aria-label=["Member helper close"]',
      'fixture.tsx:17: literal-attribute: title=["Method helper open"]',
      'fixture.tsx:18: literal-attribute: text=["Getter member close"]',
      'fixture.tsx:18: literal-attribute: label=["Chained getter close"]',
      'fixture.tsx:19: jsx-expression: ["Local helper close"]',
    ]);
  });

  it("detects fixed copy passed to user-visible toast methods", () => {
    const diagnostics = auditSource(
      "fixture.tsx",
      `
        import { toast as notify } from 'sonner';
        const localToast = notify;
        const saveFailure = 'Could not save';
        notify.error('Session failed');
        localToast.success(saveFailure);
        notify.info('Profile updated');
        notify.loading('Saving profile');
        notify('Saved');
        notify.promise(work, {
          loading: 'Saving',
          success: () => 'Saved from promise',
          error: 'Promise failed',
          description: 'Promise details',
        });
        notify.warning(record.warning);
      `,
    ).map(formatDiagnostic);

    expect(diagnostics).toEqual([
      'fixture.tsx:5: literal-toast: error=["Session failed"]',
      'fixture.tsx:6: literal-toast: success=["Could not save"]',
      'fixture.tsx:7: literal-toast: info=["Profile updated"]',
      'fixture.tsx:8: literal-toast: loading=["Saving profile"]',
      'fixture.tsx:9: literal-toast: message=["Saved"]',
      'fixture.tsx:11: literal-toast: promise.loading=["Saving"]',
      'fixture.tsx:12: literal-toast: promise.success=["Saved from promise"]',
      'fixture.tsx:13: literal-toast: promise.error=["Promise failed"]',
      'fixture.tsx:14: literal-toast: promise.description=["Promise details"]',
    ]);
  });

  it("detects toast copy in shorthand, method, alias, and spread options", () => {
    const diagnostics = auditSource(
      "fixture.tsx",
      `
        import { toast } from 'sonner';
        const description = 'Regular toast details';
        const promiseDescription = 'Promise shorthand details';
        const success = () => 'Saved shorthand';
        const promiseCopy = {
          loading: 'Saving from alias',
          success() { return 'Saved from method'; },
          error() { return 'Failed from method'; },
          description() { return 'Promise method details'; },
        };
        toast.error(record.error, { description });
        toast.promise(work, { success, description: promiseDescription });
        toast.promise(work, { ...promiseCopy });
      `,
    ).map(formatDiagnostic);

    expect(diagnostics).toEqual([
      'fixture.tsx:12: literal-toast: description=["Regular toast details"]',
      'fixture.tsx:13: literal-toast: promise.success=["Saved shorthand"]',
      'fixture.tsx:13: literal-toast: promise.description=["Promise shorthand details"]',
      'fixture.tsx:7: literal-toast: promise.loading=["Saving from alias"]',
      'fixture.tsx:8: literal-toast: promise.success=["Saved from method"]',
      'fixture.tsx:9: literal-toast: promise.error=["Failed from method"]',
      'fixture.tsx:10: literal-toast: promise.description=["Promise method details"]',
    ]);
  });

  it("detects function-declaration callbacks used as shorthand toast options", () => {
    const diagnostics = auditSource(
      "fixture.tsx",
      `
        import { toast } from 'sonner';
        function success() { return 'Saved from declaration'; }
        function description() { return 'Details from declaration'; }
        toast.error(record.error, { description });
        toast.promise(work, { success, description });
      `,
    ).map(formatDiagnostic);

    expect(diagnostics).toEqual([
      'fixture.tsx:5: literal-toast: description=["Details from declaration"]',
      'fixture.tsx:6: literal-toast: promise.success=["Saved from declaration"]',
      'fixture.tsx:6: literal-toast: promise.description=["Details from declaration"]',
    ]);
  });

  it("detects getter accessors used for toast option copy", () => {
    const diagnostics = auditSource(
      "fixture.tsx",
      `
        import { toast } from 'sonner';
        toast.error(record.error, {
          get description() { return 'Getter details'; },
        });
        toast.promise(work, {
          get success() { return 'Getter success'; },
          get error() { return 'Getter error'; },
        });
      `,
    ).map(formatDiagnostic);

    expect(diagnostics).toEqual([
      'fixture.tsx:4: literal-toast: description=["Getter details"]',
      'fixture.tsx:7: literal-toast: promise.success=["Getter success"]',
      'fixture.tsx:8: literal-toast: promise.error=["Getter error"]',
    ]);
  });

  it("rejects imported calls inside resolved toast option properties", () => {
    const diagnostics = auditSource(
      "fixture.tsx",
      `
        import { importedDescription, importedSuccess, t } from './toast-copy';
        import { toast } from 'sonner';
        toast.error(t('common.error'), {
          description: importedDescription(),
        });
        toast.promise(work, {
          get success() { return importedSuccess(); },
          error: () => t('saved'),
        });
        toast(t('saved'));
      `,
    ).map(formatDiagnostic);

    expect(diagnostics).toEqual([
      "fixture.tsx:4: unresolved-toast-message: error=[import:t()]",
      "fixture.tsx:5: unresolved-toast-options: error.description=[import:importedDescription()]",
      "fixture.tsx:8: unresolved-toast-options: promise.success=[import:importedSuccess()]",
      "fixture.tsx:9: unresolved-toast-options: promise.error=[import:t()]",
      "fixture.tsx:11: unresolved-toast-message: message=[import:t()]",
    ]);
  });

  it("allows toast catalog calls from the app i18n hook", () => {
    const diagnostics = auditSource(
      "fixture.tsx",
      `
        import { useI18n } from '@/i18n';
        import { toast } from 'sonner';
        const { t } = useI18n();
        toast.error(t('common.error'));
        toast.promise(work, { success: () => t('common.saved') });
      `,
    );

    expect(diagnostics).toEqual([]);
  });

  it("rejects a catalog-hook lookalike from an unrelated module", () => {
    const diagnostics = auditSource(
      "fixture.tsx",
      `
        import { useI18n } from 'third-party/i18n';
        import { toast } from 'sonner';
        const { t } = useI18n();
        toast.error(t('saved'));
      `,
    ).map(formatDiagnostic);

    expect(diagnostics).toEqual(["fixture.tsx:5: unresolved-toast-message: error=[dynamic:t()]"]);
  });

  it("rejects unresolved toast options and resolves local option helpers", () => {
    const diagnostics = auditSource(
      "fixture.tsx",
      `
        import {
          description,
          importedList,
          importedOptions,
          makeOptions,
          promiseOptions,
          success,
        } from './toast-copy';
        import { toast } from 'sonner';
        const indirectLabels = { description };
        const { description: indirectDescription } = indirectLabels;
        const { description: destructuredDescription } = importedOptions;
        const [destructuredSuccess] = importedList;
        function localOptions() {
          return { success: 'Saved from local helper' };
        }
        toast.promise(work, promiseOptions);
        toast.promise(work, makeOptions());
        toast.promise(work, localOptions());
        toast.error(record.error, { description });
        toast.promise(work, { success });
        toast.error(record.error, { description: destructuredDescription });
        toast.promise(work, { success: destructuredSuccess });
        toast.error(record.error, { description: indirectDescription });
      `,
    ).map(formatDiagnostic);

    expect(diagnostics).toEqual([
      'fixture.tsx:11: literal-object-property: description=["[import:description]"]',
      "fixture.tsx:18: unresolved-toast-options: promise=[import:promiseOptions]",
      "fixture.tsx:19: unresolved-toast-options: promise=[import:makeOptions()]",
      'fixture.tsx:16: literal-toast: promise.success=["Saved from local helper"]',
      "fixture.tsx:21: unresolved-toast-options: error.description=[import:description]",
      "fixture.tsx:22: unresolved-toast-options: promise.success=[import:success]",
      "fixture.tsx:23: unresolved-toast-options: error.description=[import:importedOptions.description]",
      "fixture.tsx:24: unresolved-toast-options: promise.success=[import:importedList.0]",
      "fixture.tsx:25: unresolved-toast-options: error.description=[import:description]",
    ]);
  });

  it("detects a Sonner toast through a namespace import", () => {
    const diagnostics = auditSource(
      "fixture.tsx",
      `
        import * as Sonner from 'sonner';
        Sonner.toast.message('Namespace toast');
      `,
    ).map(formatDiagnostic);

    expect(diagnostics).toEqual(['fixture.tsx:3: literal-toast: message=["Namespace toast"]']);
  });

  it("detects fixed exported helper copy and unsafe date formatting in production TypeScript", () => {
    const diagnostics = auditSource(
      "copy.ts",
      `
        export const closeLabel = () => 'Close';
        export const toLocalInputValue = () => 'Fake UI copy';
        export function unsafeDate(value: string, locale: string) {
          return new Intl.DateTimeFormat(locale).format(new Date(value));
        }
      `,
    ).map(formatDiagnostic);

    expect(diagnostics).toEqual([
      'copy.ts:2: literal-export-return: ["Close"]',
      'copy.ts:3: literal-export-return: ["Fake UI copy"]',
      "copy.ts:5: direct-intl-date-format: use the shared locale formatter",
    ]);
  });

  it("includes all production TypeScript roots", () => {
    expect(PRODUCTION_SOURCE_ROOTS).toEqual(["src"]);
    const files = productionSourceFiles(path.join(process.cwd(), "src"));
    expect(files).toContain(path.join(process.cwd(), "src/lib/when.ts"));
    expect(files).toContain(path.join(process.cwd(), "src/lib/session-query-boundary.tsx"));
  });

  it("allows catalog calls, authored values, stable codes, and reviewed non-copy text", () => {
    const diagnostics = auditSource(
      "fixture.tsx",
      `
        const eventName = 'brief.sent';
        export function Fixture() {
          return <section data-event={eventName}>
            <span>TuringCare</span>
            <span>TuringCare ·</span>
            <svg><text>z</text></svg>
            <p>{t('brief.title')}</p>
            <p>{record.description}</p>
            <button aria-label={t('common.close')} />
          </section>;
        }
      `,
    );

    expect(diagnostics).toEqual([]);
  });

  it("finds no uncatalogued production copy or direct locale formatting", () => {
    const diagnostics = auditProductionUi();
    expect(diagnostics, diagnostics.join("\n")).toEqual([]);
  });
});
