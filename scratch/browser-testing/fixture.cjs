// Entirely fictional standards and measurements, used only in local tests.
const context = { selected_codes: ['Sample Standard A', 'Sample Standard B'], document_name: 'Illustrative plan.pdf', requested_pages: '2-4' };
function finding(code, title, compliant, page) {
    return {
        code_id: code, rule_key: '4.2', title, compliant, severity: 'Medium',
        requirement: 'Illustrative requirement only: provide a 1,000 mm clear opening.',
        observed: 'The sample drawing records an 850 mm clear opening.',
        explanation: 'For this fictional check, 850 mm is 150 mm below the illustrative 1,000 mm requirement. The marked opening is the affected location.',
        recommendation: 'Revise the sample opening detail and dimension the clear width.',
        references: [{ source_id: 'source-1', clause: '4.2', pdf_page: page, printed_page: String(page - 2), excerpt: 'Provide a clear opening of at least 1,000 mm.' }],
        evidence: [{ document: context.document_name, pdf_page: 3, sheet: 'A-102', location: 'Ground floor / east entrance', observation: 'Dimension annotation: clear opening 850 mm.' }],
    };
}
function output(code, title, compliant, page) {
    return { request_context: context, sources: [{ id: 'source-1', code_id: code, title: code + ' - fictional design fixture', edition: 'Sample edition', jurisdiction: 'Illustrative only', url: 'https://example.org/' + encodeURIComponent(code) + '.pdf' }], findings: [finding(code, title, compliant, page)] };
}
const a = output(context.selected_codes[0], 'East entrance / clear opening', false, 12);
const b = output(context.selected_codes[1], 'Entrance approach / missing dimension', null, 24);
b.findings[0].requirement = 'Illustrative requirement only: establish the approach width from a dimensioned plan.';
b.findings[0].observed = 'Approach width is not dimensioned in the sample.';
b.findings[0].explanation = 'The approach cannot be assessed without a reliable dimension. No failure or pass is inferred.';
b.findings[0].recommendation = 'Supply a dimensioned approach detail.';
b.findings[0].references[0].excerpt = 'Record the clear approach width.';
b.findings[0].evidence[0].observation = 'No approach dimension is shown.';
b.findings[0].evidence[0].pdf_page = 4;
module.exports = { context, payloads: [a, b], finding };
