module.exports = function createGateLifecycle({
  normalizeMode,
  DEFAULT_MODE,
  GATE_ALIASES,
  gateApprovalContext,
  requireState,
  saveState,
  writeProjection,
  appendEvent,
  writeGateDecision,
  DEFAULT_STATE
}) {
  function recommendNext(state) {
    const stale = inspectGateApprovals(state).find(item => !item.valid);
    if (stale) return `Blocked: ${stale.reason} Run reopen-gate <workbench> --gate ${stale.gate} --reason "<变更原因>"; then obtain fresh approval.`;
    const mode = normalizeMode(state.mode || DEFAULT_MODE);
    if (state.gates.gate1 !== 'approved') {
      return mode === 'lite'
        ? 'Next: complete brief.md, run check-workbench, then approve-scope.'
        : 'Next: complete scope/contract alignment, run check-workbench, then approve-scope.';
    }
    if (mode === 'lite') {
      if (state.gates.gate4 !== 'approved') return 'Next: implement the small change, record validation/evidence, then request-final/approve-final.';
      return 'Next: final actions may run only after explicit checks.';
    }
    if (state.gates.gate2 !== 'approved') {
      return 'Next: complete task plan, review strategy, validation skeleton and approve-plan.';
    }
    if (state.gates.gate3 !== 'approved') {
      return 'Next: execute approved tasks, fan-in review packs and validation, then run verify/request-review.';
    }
    if (state.gates.gate4 !== 'approved') {
      return 'Next: human reviews Gate Review artifacts, then request/approve Final gate.';
    }
    return 'Next: final actions may run only after explicit checks.';
  }

  function requireGate(state, gate) {
    if (state.gates[gate] !== 'approved') {
      throw new Error(`${GATE_ALIASES[gate] || gate} gate is not approved.`);
    }
    if (!hasGateHumanConfirmation(state, gate)) {
      throw new Error(
        `${GATE_ALIASES[gate]} gate is approved but missing explicit user confirmation. Run reopen-gate --gate ${GATE_ALIASES[gate]}, then approve again with explicit user confirmation.`
      );
    }
    const confirmation = state.humanConfirmations[gate];
    const currentContext = gateApprovalContext(state, gate);
    if (
      !confirmation.approvalContext ||
      JSON.stringify(confirmation.approvalContext) !== JSON.stringify(currentContext)
    ) {
      throw new Error(
        `${GATE_ALIASES[gate]} gate approval no longer matches current workflow state. Run reopen-gate --gate ${GATE_ALIASES[gate]} --reason "<变更原因>", then repeat the gate workflow with explicit user confirmation.`
      );
    }
  }

  function hasGateHumanConfirmation(state, gate) {
    const confirmation = state.humanConfirmations && state.humanConfirmations[gate];
    return (
      confirmation &&
      confirmation.confirmedBy === 'user' &&
      String(confirmation.confirmationText || '').trim().length >= 6
    );
  }

  function inspectGateApprovals(state) {
    return Object.entries(GATE_ALIASES)
      .filter(([key]) => state.gates[key] === 'approved')
      .map(([key, gate]) => {
        try {
          requireGate(state, key);
          return { gate, valid: true };
        } catch (error) {
          return { gate, valid: false, reason: error.message };
        }
      });
  }

  function reopenGate(workbench, options) {
    const state = requireState(workbench);
    const gates = Object.keys(GATE_ALIASES);
    const index = gates.findIndex(key => GATE_ALIASES[key] === options.gate);
    if (index < 0) throw new Error('reopen-gate requires --gate scope|plan|review|final.');
    const reason = String(options.reason || '').trim();
    if (reason.length < 6) throw new Error('reopen-gate requires --reason explaining the change (at least 6 characters).');
    const lite = normalizeMode(state.mode || DEFAULT_MODE) === 'lite';
    if (lite && (index === 1 || index === 2)) throw new Error('Plan and Review are skipped in lite mode. Reopen scope or final.');
    for (const key of gates.slice(0, index)) {
      if (state.gates[key] !== 'skipped') requireGate(state, key);
    }
    const selected = gates[index];
    let currentContext;
    try { currentContext = gateApprovalContext(state, selected); }
    catch (error) { currentContext = { error: error.message }; }
    const history = {
      gate: options.gate,
      reason,
      at: new Date().toISOString(),
      previousGates: { ...state.gates },
      previousConfirmations: JSON.parse(JSON.stringify(state.humanConfirmations || {})),
      currentContext
    };
    state.approvalHistory = [...(state.approvalHistory || []), history];
    state.humanConfirmations = { ...(state.humanConfirmations || {}) };
    for (const key of gates.slice(index)) {
      state.gates[key] = key === selected ? 'pending' : 'locked';
      delete state.humanConfirmations[key];
    }
    if (lite) {
      state.gates.gate2 = 'skipped';
      state.gates.gate3 = 'skipped';
    }
    state.phase = ['scope_pending', 'scope_approved', 'plan_approved', lite ? 'scope_approved' : 'review_approved'][index];
    if (index < 2) {
      state.execution = JSON.parse(JSON.stringify(DEFAULT_STATE.execution));
      state.validationDecisions = {};
    }
    if (index < 3) delete state.verificationSnapshot;
    for (const field of ['finalActions', 'finalActionTargets', 'finalActionChecks']) delete state[field];
    state.checks = JSON.parse(JSON.stringify(DEFAULT_STATE.checks));
    state.updatedAt = history.at;
    saveState(workbench, state);
    for (const key of gates.slice(index)) {
      writeGateDecision(workbench, Number(key.slice(4)), state, { reason, reopened: true }, GATE_ALIASES[key]);
    }
    writeProjection(workbench, state);
    appendEvent(workbench, 'gate.reopened', history);
    console.log(`Reopened ${options.gate}; affected approvals are invalidated. History preserved; fresh user approval is required.`);
  }

  return {
    recommendNext,
    requireGate,
    hasGateHumanConfirmation,
    inspectGateApprovals,
    reopenGate
  };
};
