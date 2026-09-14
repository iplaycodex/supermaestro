const fs = require('fs');
const path = require('path');
const { collectValidationContractIssues } = require('./validation-evidence');

module.exports = function createArtifactValidation({
  normalizeMode,
  DEFAULT_MODE,
  readBoolean,
  hasUiManifest,
  hasApiMaterial,
  hasSchemaMapHeaders,
  resolveWorkbenchRef,
  hasNonEmptyFile,
  hasReviewContractHeaders
}) {
  function collectContractIssues(workbench, state, options = {}) {
    const mode = normalizeMode(state.mode || DEFAULT_MODE);
    if (mode === 'lite' && !readBoolean(options.strict, false)) return [];

    const triggers = state.artifacts?.triggers || {};
    const strict = mode === 'strict' || readBoolean(options.strict, false);
    const uiRequired = hasUiManifest(workbench) || triggers.ui === true;
    const apiRequired = hasApiMaterial(workbench) || triggers.api === true;
    const uiCodingRequired = triggers.uiCoding === true || (strict && uiRequired);
    const behaviorRequired = triggers.behavior === true || strict;
    const reviewRequired = triggers.review === true || mode === 'standard' || mode === 'strict';
    const validationRequired = triggers.e2e === true || triggers.visual === true;
    const issues = [];

    if (uiRequired) {
      const hasUiContract = requireNonEmpty(
        issues,
        workbench,
        'specs/ui-contract.md',
        'UI contract markdown is missing or empty.'
      );
      const uiContractRef = requireJsonAny(
        issues,
        workbench,
        ['specs/machine/ui-contract.json', 'specs/ui-contract.json'],
        'UI contract JSON is missing or invalid.'
      );
      const hasUiIndex = requireNonEmpty(
        issues,
        workbench,
        'specs/ui-material-index.md',
        'UI material index is missing or empty.'
      );
      if (hasUiContract && uiContractRef && hasUiIndex) {
        validateUiContractContent(issues, workbench, uiContractRef);
      }
    }

    if (uiCodingRequired) {
      if (requireNonEmpty(issues, workbench, 'specs/ui-schema-extract.md', 'UI schema extract is missing or empty.')) {
        const schemaExtract = fs.readFileSync(path.join(workbench, 'specs/ui-schema-extract.md'), 'utf8');
        if (!hasSchemaMapHeaders(schemaExtract)) {
          const legacyMap = resolveWorkbenchRef(workbench, 'specs/ui-schema-map.md');
          const legacyOk = hasNonEmptyFile(legacyMap) && hasSchemaMapHeaders(fs.readFileSync(legacyMap, 'utf8'));
          if (!legacyOk) {
            issues.push({ level: 'FAIL', message: 'UI schema extract must include the standard Schema-to-implementation mapping table, or fallback specs/ui-schema-map.md must include it.' });
          }
        }
      }
    }

    if (apiRequired) {
      if (requireNonEmpty(issues, workbench, 'specs/api-contract.md', 'API contract markdown is missing or empty.')) {
        validateApiContractContent(issues, workbench);
      }
      requireJsonAny(issues, workbench, ['specs/machine/api-contract.json', 'specs/api-contract.json'], 'API contract JSON is missing or invalid.');
    }

    if (apiRequired && uiRequired) {
      requireNonEmpty(issues, workbench, 'specs/page-contract-matrix.md', 'Page contract matrix is missing or empty.');
    }

    if (behaviorRequired && requireNonEmpty(issues, workbench, 'specs/behavior-contract.md', 'Behavior contract is missing or empty.')) {
      validateBehaviorContractContent(issues, workbench);
    }

    if (reviewRequired) {
      validateReviewContract(issues, workbench);
    }

    if (validationRequired) {
      validateValidationContractContent(issues, workbench, triggers, options);
    }

    return issues;
  }

  function validateValidationContractContent(issues, workbench, triggers, options = {}) {
    const ref = 'specs/machine/validation-contract.json';
    const file = resolveWorkbenchRef(workbench, ref);
    if (!hasNonEmptyFile(file)) {
      issues.push({ level: 'FAIL', message: 'Validation contract JSON is missing or empty.' });
      return;
    }
    let contract;
    try {
      contract = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      issues.push({ level: 'FAIL', message: 'Validation contract JSON is invalid.' });
      return;
    }
    const contractIssues = collectValidationContractIssues(contract, triggers)
      .filter(message =>
        options.phase !== 'plan' ||
        !/sourceRevision is required/i.test(message)
      );
    for (const message of contractIssues) {
      issues.push({ level: 'FAIL', message });
    }
  }

  function requireNonEmpty(issues, workbench, ref, message) {
    if (hasNonEmptyFile(resolveWorkbenchRef(workbench, ref))) return true;
    issues.push({ level: 'FAIL', message });
    return false;
  }

  function requireJson(issues, workbench, ref, message) {
    const file = resolveWorkbenchRef(workbench, ref);
    if (!hasNonEmptyFile(file)) {
      issues.push({ level: 'FAIL', message });
      return false;
    }
    try {
      JSON.parse(fs.readFileSync(file, 'utf8'));
      return true;
    } catch {
      issues.push({ level: 'FAIL', message });
      return false;
    }
  }

  function requireJsonAny(issues, workbench, refs, message) {
    const existing = refs.find(ref => hasNonEmptyFile(resolveWorkbenchRef(workbench, ref)));
    if (!existing) {
      issues.push({ level: 'FAIL', message });
      return '';
    }
    return requireJson(issues, workbench, existing, message) ? existing : '';
  }

  function validateUiContractContent(issues, workbench, jsonRef) {
    const markdown = fs.readFileSync(
      resolveWorkbenchRef(workbench, 'specs/ui-contract.md'),
      'utf8'
    );
    const materialIndex = fs.readFileSync(
      resolveWorkbenchRef(workbench, 'specs/ui-material-index.md'),
      'utf8'
    );
    if (/(?:\bpending\b|TODO|待补|待确认)/i.test(markdown)) {
      issues.push({
        level: 'FAIL',
        message: 'UI contract still contains unresolved template placeholders.'
      });
    }
    if (/(?:\bpending\b|TODO|待补|待确认)/i.test(materialIndex)) {
      issues.push({
        level: 'FAIL',
        message: 'UI material index still contains unresolved template placeholders.'
      });
    }
    let contract;
    try {
      contract = JSON.parse(fs.readFileSync(resolveWorkbenchRef(workbench, jsonRef), 'utf8'));
    } catch {
      return;
    }
    if (!Array.isArray(contract.boards) || contract.boards.length === 0) {
      issues.push({
        level: 'FAIL',
        message: 'UI contract JSON boards must contain at least one bound board.'
      });
    }
  }

  function validateApiContractContent(issues, workbench) {
    const content = fs.readFileSync(path.join(workbench, 'specs/api-contract.md'), 'utf8');
    const hasPlaceholder = /(pending|TODO|待补|待确认)/i.test(content);
    const hasConclusion = /(blocked|partial|无接口变更|无 API|无接口|no api changes|no interface changes)/i.test(content);
    const hasConcreteApi = /\b(GET|POST|PUT|DELETE|PATCH)\b|\/[a-z0-9_-]+|接口[:：]/i.test(content);
    if (hasPlaceholder && !hasConclusion) {
      issues.push({ level: 'FAIL', message: 'API contract still contains template placeholders without blocked/partial/no-change conclusion.' });
    }
    if (!hasConclusion && !hasConcreteApi) {
      issues.push({ level: 'FAIL', message: 'API contract must contain concrete APIs, blocked/partial status, or explicit no API changes conclusion.' });
    }
  }

  function validateBehaviorContractContent(issues, workbench) {
    const content = fs.readFileSync(path.join(workbench, 'specs/behavior-contract.md'), 'utf8');
    const hasPlaceholder = /(pending|TODO|待补|待确认)/i.test(content);
    const hasRisk = /(open|blocking|blocked|阻塞|风险|pending)/i.test(content);
    if (hasPlaceholder && !hasRisk) {
      issues.push({ level: 'FAIL', message: 'Behavior contract still contains template placeholders.' });
      return;
    }
    if (hasRisk) {
      const projection = [
        path.join(workbench, 'plans/progress.md'),
        path.join(workbench, 'reports/validation.md')
      ]
        .filter(file => fs.existsSync(file))
        .map(file => fs.readFileSync(file, 'utf8'))
        .join('\n\n');
      if (/(open|blocking|blocked|阻塞|风险)/i.test(content) && !/(behavior|行为|状态机|权限|缓存|并发|阻塞|风险)/i.test(projection)) {
        issues.push({ level: 'FAIL', message: 'Behavior contract risks must be mirrored in plans/progress.md or reports/validation.md.' });
      }
    }
  }

  function validateReviewContract(issues, workbench) {
    const reviewPacks = resolveWorkbenchRef(workbench, 'reviews/review-packs.md');
    const legacyReviewContract = resolveWorkbenchRef(workbench, 'specs/review-contract.md');
    const candidate = hasNonEmptyFile(reviewPacks) && hasReviewContractHeaders(fs.readFileSync(reviewPacks, 'utf8'))
      ? reviewPacks
      : hasNonEmptyFile(legacyReviewContract)
        ? legacyReviewContract
        : '';
    if (!candidate) {
      issues.push({ level: 'FAIL', message: 'Review contract or review packs are missing.' });
      return;
    }
    const content = fs.readFileSync(candidate, 'utf8');
    if (!/(git diff|diff command|patch|branch|PR|pull request|pending|待实现|待绑定)/i.test(content)) {
      issues.push({ level: 'FAIL', message: 'Review contract must point to diff/patch/branch/PR or explicitly mark pending state.' });
    }
  }

  return {
    collectContractIssues,
    validateValidationContractContent,
    requireNonEmpty,
    requireJson,
    requireJsonAny,
    validateUiContractContent,
    validateApiContractContent,
    validateBehaviorContractContent,
    validateReviewContract
  };
};
