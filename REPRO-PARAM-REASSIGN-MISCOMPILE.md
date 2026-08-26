# BUG: parameter reassignment inside traced functions miscompiles

Found 2026-08-25 via ilmato OpenPBR Issue #2 (see
ilmato/doc/openpbr/ISSUE2-POSTMORTEM.md).

## Symptom

An inlined ti.func that REASSIGNS one of its own parameters:

```js
static evaluate_specular = (material_info, wo, wi) => {
    wo = -tm.normalize(wo);      // <-- reassigns parameter
    wi = tm.normalize(wi);
    ...
}
```

compiles without any error, but downstream uses of that parameter see
corrupted state - manifesting as EXACT-ZERO contributions for arbitrary,
configuration-dependent subsets of call sites (in ilmato: half a 6x6
point-light grid lost its specular term entirely; diffuse unaffected).

## Mechanism

InliningCompiler.registerArguments bound parameter symbols DIRECTLY to
the caller-side argument Values (no local copy). A parameter assignment
therefore wrote THROUGH to the caller's variable: the callee clobbered
the caller's expression result for every subsequent use. In ilmato's
shade pass, v_ts is computed once per pixel and consumed by every light
iteration - the first specular call negated it in storage, and every
following light evaluated against a double-flipped view vector and was
horizon-guarded to zero.

## Fix

registerArguments (InliningCompiler) now mirrors visitVariableDeclaration:
non-function / non-host-object arguments are bound to
createLocalVarCopy(val) instead of the caller Value itself. Parameters
are true by-value locals; in-body reassignment is safe.

## Regression signal

ilmato tests/gpu_harness CASES.zzz_specgrid + CASES.zzz_issue2
(framesweep): per-light alive table must be uniform across all lights.


---

## STATUS 2026-08-25 (evening)

- Downstream fix shipped in ilmato (fresh locals in evaluate_specular);
  visual + numeric confirmation complete.
- Copy-at-entry fix attempt (createLocalVarCopy in registerArguments)
  REGRESSED broad ilmato suites - reverted. Lazy-promotion of
  non-pointer assignment LHS also regressed identically. Common
  signature: generated WGSL contains `array<i32, 0>` -> InvalidShaderModule
  cascade. Same breakage occurs on clean HEAD WITHOUT these edits
  (verified by rebuild), so at least one additional regression exists in
  recent runtime commits (421cc88 per-field SNodeTree / d8c9128 canvas
  hooks) interacting with ilmato's renderer-per-case lifecycle
  (renderer_dispose among failures). Known-good pinned vendor:
  latentlab f3cb616 blob (3501956 bytes).
- Proper param-SSA fix remains OPEN and is judged feasible but requires
  dedicated investigation of inline-expansion value/versioning; use the
  ilmato framesweep/specgrid harness cases as regression oracle.

## RESOLUTION 2026-08-26 (guard v2 shipped)

- The "HEAD regression breaking ilmato scenes" was NOT a runtime bug: the
  loud-error guard commit (9607c06) had accidentally swept in an extra
  `create_return_vec` emission inside InliningCompiler.visitReturnStatement,
  double-emitting returns for every traced function -> corrupted IR ->
  `array<i32, 0>` WGSL -> InvalidShaderModule cascades. Removing the two
  stray lines restored 18/18 immediately. Lesson: one commit = one concern;
  the bisect that exonerated d8c9128 took minutes once the delta was
  actually diffed.
- Guard v2 (this commit): fires ONLY on SELF-REFERENTIAL parameter
  reassignment (RHS mentions the parameter - the wo = -f(wo)
  versioning-corruption pattern, AGENTS.md tinyti constraint #10).
  Non-self-referential param writes (gamutTransform's r = inv * x0) stay
  legal: they alias the caller's variable, which is harmless when the
  caller does not re-read the argument.
- Contract-tested by ilmato harness case `guard_param_reassign`:
  self-ref throws the actionable loud error; non-self-ref compiles and
  computes correctly. Full ilmato suite 19/19 with the guard active.
- Version 0.1.5.
