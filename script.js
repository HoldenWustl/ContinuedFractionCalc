const inputA = document.getElementById('inputA');
const inputB = document.getElementById('inputB');
const display = document.getElementById('fractionDisplay');

// Helper to turn strings like "2n+1" into numbers
function evaluateExpression(expr, n) {
    try {
        let formula = expr.toLowerCase();

        // 1. Support exponentiation (convert ^ to **)
        formula = formula.replace(/\^/g, '**');

        // 2. Handle implicit multiplication
        // This handles cases like 2n, (n)n, 2(n+1), and )n
        formula = formula.replace(/(\d|n|\))(?=[n\(])|(\))(?=\d)/g, '$1*');

        // 3. Replace "n" with the actual value
        formula = formula.replace(/n/g, `(${n})`);

        // 4. Calculate
        return Function(`'use strict'; return (${formula})`)();
    } catch (e) {
        return NaN; 
    }
}

function buildFraction(exprA, exprB, depth, n) {
    if (depth <= 0) {
        return `<div class="terminal-dots">...</div>`;
    }

    // Evaluate the expression for the current step 'n'
    const valA = evaluateExpression(exprA, n);
    const valB = evaluateExpression(exprB, n);

    // If the input is empty or invalid, show a placeholder
    const displayA = isNaN(valA) ? exprA : valA;
    const displayB = isNaN(valB) ? exprB : valB;

    return `
        <div class="fraction-grid">
            <div class="a-plus-cell">${displayA} +</div>
            <div class="numerator-cell">${displayB}</div>
            <div class="denominator-cell">
                ${buildFraction(exprA, exprB, depth - 1, n + 1)}
            </div>
        </div>
    `;
}

const decimalValue = document.getElementById('decimalValue');

function calculateValue(exprA, exprB, iterations = 2000, windowSize = 5) {
    // Helper function to calculate the result for a specific number of iterations
    const compute = (n) => {
        let val = evaluateExpression(exprA, n);
        for (let i = n - 1; i >= 1; i--) {
            let a = evaluateExpression(exprA, i);
            let b = evaluateExpression(exprB, i);
            val = a + (b / val);
        }
        return val;
    };

    // 1. Collect a window of the last few convergents (e.g., 1000, 999, 998, 997, 996)
    let convergents = [];
    for (let i = 0; i < windowSize; i++) {
        convergents.push(compute(iterations - i));
    }

    // 2. Calculate the absolute differences (deltas) between consecutive convergents
    let deltas = [];
    for (let i = 0; i < windowSize - 1; i++) {
        deltas.push(Math.abs(convergents[i] - convergents[i + 1]));
    }

    // 3. Find the total spread in our window
    let maxVal = Math.max(...convergents);
    let minVal = Math.min(...convergents);
    let spread = maxVal - minVal;

    // 4. Check for oscillation vs. slow convergence
    if (spread > 0.1) {
        let isShrinking = true;
        
        // Check if the steps are getting progressively smaller
        for (let i = 0; i < deltas.length - 1; i++) {
            // deltas[0] is the newest difference, deltas[1] is older.
            // If the newest difference is NOT smaller than the older one, it's not converging.
            if (deltas[i] >= deltas[i + 1]) {
                isShrinking = false;
                break;
            }
        }
        
        // If the spread is large and the gaps aren't shrinking, it's oscillating
        if (!isShrinking) {
            return NaN; 
        }
    }

    // If it passed the checks, return the most accurate convergent
    return convergents[0]; 
}

const exactContainer = document.getElementById('exactContainer');
const exactFormula = document.getElementById('exactFormula');
const KNOWN_FORMULAS = {
    "n-1|n": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">1</span>
                <span class="den"><i style="font-family: serif;">e</i> - 1</span>
            </span>
        </div>
    `,
     "n|n": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">1</span>
                <span class="den"><i style="font-family: serif;">e</i> - 2</span>
            </span>
        </div>
    `,
    "n|1": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num"><i style="font-family: serif;">I</i><sub>0</sub>(2)</span>
                <span class="den"><i style="font-family: serif;">I</i><sub>1</sub>(2)</span>
            </span>
        </div>
    `,
    "-n(-1)^n|1": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num"><i style="font-family: serif;">J</i><sub>0</sub>(2)</span>
                <span class="den"><i style="font-family: serif;">J</i><sub>1</sub>(2)</span>
            </span>
        </div>
    `,
    "-2n(-1)^n|1": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num"><i style="font-family: serif;">J</i><sub>0</sub>(1)</span>
                <span class="den"><i style="font-family: serif;">J</i><sub>1</sub>(1)</span>
            </span>
        </div>
    `,
  "1|n": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand">2</span>
                    </span>
                </span>
                <span class="den" style="display: flex; align-items: center; gap: 2px;">
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand" style="padding-right: 2px;"><i style="font-family: serif;">eπ</i></span>
                    </span>
                    <span>erfc</span>
                    
                    <span class="paren-group">
                        <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                            <path d="M 9,1 C 0,10 0,30 9,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="paren-content">
                            <div class="fraction-line-wrapper" style="font-size: 0.7em;">
                                <span class="num" style="padding: 0 2px; border-bottom: 1px solid currentColor;">1</span>
                                <span class="den" style="padding-top: 1px;">
                                    <span class="sqrt-wrapper" style="transform: scale(0.8);">
                                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                                        </svg>
                                        <span class="radicand">2</span>
                                    </span>
                                </span>
                            </div>
                        </span>
                        <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                            <path d="M 1,1 C 10,10 10,30 1,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                        </svg>
                    </span>
                    
                </span>
            </span>
        </div>
    `,
    "1|2n": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">2</span>
                <span class="den" style="display: flex; align-items: center; gap: 4px;">
                    <span class="sqrt-wrapper" style="position: relative;">
                        <span style="position: absolute; font-size: 0.5em; top: -2px; left: -1px;">4</span>
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand"><i style="font-family: serif;">e</i></span>
                    </span>
                    
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand"><i style="font-family: serif;">π</i></span>
                    </span>

                    <span>erfc</span>
                    
                    <span class="paren-group">
                        <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                            <path d="M 9,1 C 0,10 0,30 9,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="paren-content">
                            <div class="fraction-line-wrapper" style="font-size: 0.7em;">
                                <span class="num" style="padding: 0 2px; border-bottom: 1px solid currentColor;">1</span>
                                <span class="den" style="padding-top: 1px;">2</span>
                            </div>
                        </span>
                        <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                            <path d="M 1,1 C 10,10 10,30 1,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                        </svg>
                    </span>
                    
                </span>
            </span>
        </div>
    `,
    "1|n^2": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">1</span>
                <span class="den">ln(2)</span>
            </span>
        </div>
    `,
    "2n-1|n^2": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">4</span>
                <span class="den"><i style="font-family: serif;">π</i></span>
            </span>
        </div>
    `,
    "6|(2n-1)^2": `
        <div class="math-row" style="display: flex; align-items: center; gap: 6px;">
            <span>3</span>
            <span>+</span>
            <i style="font-family: serif;">π</i>
        </div>
    `,
    "2n-1|1": `
        <div class="math-row" style="display: flex; align-items: center; gap: 8px;">
            <span class="fraction-line-wrapper">
                <span class="num">1</span>
                <span class="den"><i style="font-family: serif;">e</i> - 1</span>
            </span>
            <span>&minus;</span>
            <span class="fraction-line-wrapper">
                <span class="num">1</span>
                <span class="den"><i style="font-family: serif;">e</i> + 1</span>
            </span>
            <span>+</span>
            <span>1</span>
        </div>
    `,
    "6n-3|-(n^2)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">2</span>
                <span class="den">ln(2)</span>
            </span>
        </div>
    `,
    "2|(2n-1)^2": `
        <div class="math-row" style="display: flex; align-items: center; gap: 8px;">
            <span>1</span>
            <span>+</span>
            <span class="fraction-line-wrapper">
                <span class="num">4</span>
                <span class="den"><i style="font-family: serif;">π</i></span>
            </span>
        </div>
    `,
    "2n-1|2n": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">1</span>
                <span class="den" style="display: flex; align-items: center; gap: 6px;">
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand"><i style="font-family: serif;">e</i></span>
                    </span>
                    <span>&minus;</span>
                    <span>1</span>
                </span>
            </span>
        </div>
    `,
    "n-1|n+1": `
        <div class="math-row">
            <span>1</span>
        </div>
    `,
    "2n|1": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num"><i style="font-family: serif;">I</i><sub>0</sub>(1)</span>
                <span class="den"><i style="font-family: serif;">I</i><sub>1</sub>(1)</span>
            </span>
        </div>
    `,
    "2n-1|-1": `
        <div class="math-row">
            <span>cot(1)</span>
        </div>
    `,
    "n+1|-n": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num"><i style="font-family: serif;">e</i></span>
                <span class="den"><i style="font-family: serif;">e</i> &minus; 1</span>
            </span>
        </div>
    `,
    "n+2|-n": `
        <div class="math-row">
            <span><i style="font-family: serif;">e</i></span>
        </div>
    `,
    "n|n+1": `
        <div class="math-row">
            <span><i style="font-family: serif;">e</i> &minus; 1</span>
        </div>
    `,
    "4n-2|1": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num"><i style="font-family: serif;">e</i> &plus; 1</span>
                <span class="den"><i style="font-family: serif;">e</i> &minus; 1</span>
            </span>
        </div>
    `,
    "12|(4n-2)^2": `
        <div class="math-row" style="display: flex; align-items: center; gap: 6px;">
            <span>2<i style="font-family: serif;">π</i></span>
            <span>+</span>
            <span>6</span>
        </div>
    `,
    "4|(2n-1)^2": `
        <div class="math-row" style="display: flex; align-items: center; gap: 8px;">
            <span>2</span>
            <span>+</span>
            <span class="fraction-line-wrapper">
                <span class="num" style="display: flex; align-items: center; gap: 2px;">
                    <span style="font-family: serif;">&Gamma;</span>
                    
                    <span style="display: inline-flex; align-items: center;">
                        <span class="paren-group">
                            <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                                <path d="M 9,1 C 0,10 0,30 9,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                            </svg>
                            <span class="paren-content">
                                <div class="fraction-line-wrapper" style="font-size: 0.7em;">
                                    <span class="num" style="padding: 0 2px; border-bottom: 1px solid currentColor;">1</span>
                                    <span class="den" style="padding-top: 1px;">4</span>
                                </div>
                            </span>
                            <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                                <path d="M 1,1 C 10,10 10,30 1,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                            </svg>
                        </span>
                        <sup style="align-self: flex-start; margin-top: 2px; margin-left: 2px; font-size: 0.85em;">4</sup>
                    </span>
                    
                </span>
                <span class="den">
                    8<i style="font-family: serif;">π</i><sup style="margin-left: 1px;">2</sup>
                </span>
            </span>
        </div>
    `,
    "1|n(n+1)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">2</span>
                <span class="den"><i style="font-family: serif;">π</i> &minus; 2</span>
            </span>
        </div>
    `,
    "2|2n(2n+1)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">2</span>
                <span class="den"><i style="font-family: serif;">&#982;</i> &minus; 2</span>
            </span>
        </div>
    `,
    "8(n-1)|(2n-1)^4": `
        <div class="math-row" style="display: flex; align-items: center; gap: 8px;">
            <span class="fraction-line-wrapper">
                <span class="num">1</span>
                <span class="den"><i style="font-family: serif;">G</i></span>
            </span>
            <span>&minus;</span>
            <span>1</span>
        </div>
    `,
    "2n-1|n^4": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">12</span>
                <span class="den"><i style="font-family: serif;">π</i><sup style="margin-left: 1px;">2</sup></span>
            </span>
        </div>
    `,
    "n+1|n": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">1</span>
                <span class="den">2<i style="font-family: serif;">e</i> &minus; 5</span>
            </span>
        </div>
    `,
    "2n-2|2n-1": `
        <div class="math-row" style="display: flex; align-items: center; gap: 8px;">
            <span class="fraction-line-wrapper">
                <span class="num">
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand">2<i style="font-family: serif;">e</i></span>
                    </span>
                </span>
                <span class="den" style="display: flex; align-items: center; gap: 2px;">
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand"><i style="font-family: serif;">π</i></span>
                    </span>
                    <span style="margin-left: 2px;">erfi</span>
                    <span class="paren-group">
                        <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                            <path d="M 9,1 C 0,10 0,30 9,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="paren-content">
                            <div class="fraction-line-wrapper" style="font-size: 0.7em;">
                                <span class="num" style="padding: 0 2px; border-bottom: 1px solid currentColor;">1</span>
                                <span class="den" style="padding-top: 1px;">
                                    <span class="sqrt-wrapper">
                                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                                        </svg>
                                        <span class="radicand">2</span>
                                    </span>
                                </span>
                            </div>
                        </span>
                        <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                            <path d="M 1,1 C 10,10 10,30 1,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                        </svg>
                    </span>
                </span>
            </span>
            
            <span style="display: flex; gap: 8px; transform: translateY(-0.5em);">
                <span>&minus;</span>
                <span>1</span>
            </span>
        </div>
    `,
    "34(n-1)^3+51(n-1)^2+27(n-1)+5|-(n^6)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">6</span>
                <span class="den"><i style="font-family: serif;">&zeta;</i>(3)</span>
            </span>
        </div>
    `,
    "n|n(n+1)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num" style="display:flex; align-items:center; gap:4px;">
                    1 + 
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand">5</span>
                    </span>
                </span>
                <span class="den">2</span>
            </span>
        </div>
    `,
    "1|1": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num" style="display:flex; align-items:center; gap:4px;">
                    1 + 
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand">5</span>
                    </span>
                </span>
                <span class="den">2</span>
            </span>
        </div>
    `,
    "1|(-1)^n": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num" style="display:flex; align-items:center; gap:4px;">
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand">5</span>
                    </span>
                    &minus; 1
                </span>
                <span class="den">2</span>
            </span>
        </div>
    `,
     "11(n-1)^2+11(n-1)+3|n^4": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">30</span>
                <span class="den"><i style="font-family: serif;">π</i><sup style="margin-left: 1px;">2</sup></span>
            </span>
        </div>
    `,
    "2(n-1)^2+2(n-1)+1|-(n^4)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">6</span>
                <span class="den"><i style="font-family: serif;">π</i><sup style="margin-left: 1px;">2</sup></span>
            </span>
        </div>
    `,
    "3(n-1)^2+3(n-1)+1|-2(n^4)": `
        <div class="math-row" style="display: flex; align-items: center; gap: 8px;">
            <span class="fraction-line-wrapper">
                <span class="num">1</span>
                <span class="den">2<i style="font-family: serif;">G</i></span>
            </span>
        </div>
    `,
    "2n|-(n^2)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">&minus;1</span>
                <span class="den"><i style="font-family: serif;">e</i> Ei(&minus;1)</span>
            </span>
        </div>
    `,
    "2n+1|-n(n+1)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">1</span>
                <span class="den" style="display:flex; align-items:center; gap:4px;">1 + <i style="font-family: serif;">e</i> Ei(&minus;1)</span>
            </span>
        </div>
    `,
    "1|n/2": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">1</span>
                <span class="den" style="display: flex; align-items: center; gap: 4px;">
                    
                    <span><i style="font-family: serif;">e</i></span>
                    
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand"><i style="font-family: serif;">π</i></span>
                    </span>

                    <span>erfc</span>
                    
                    <span class="paren-group">
                        <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                            <path d="M 9,1 C 0,10 0,30 9,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="paren-content">1</span>
                        <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                            <path d="M 1,1 C 10,10 10,30 1,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                        </svg>
                    </span>
                    
                </span>
            </span>
        </div>
    `,
    "2n+1|n(n+2)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">4</span>
                <span class="den" style="display:flex; align-items:center; gap:4px;"><i style="font-family: serif;">π</i> &minus; 2</span>
            </span>
        </div>
    `,
    "n+3|-n": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num"><i style="font-family: serif;">e</i></span>
                <span class="den" style="display:flex; align-items:center; gap:4px;"><i style="font-family: serif;">e</i> &minus; 2</span>
            </span>
        </div>
    `,
    "3n|-n(2n-1)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">4</span>
                <span class="den" style="display:flex; align-items:center; gap:4px;">3<i style="font-family: serif;">π</i> &minus; 8</span>
            </span>
        </div>
    `,
    "7n(n-1)+2|8n^4": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">24</span>
                <span class="den"><i style="font-family: serif;">π</i><sup style="margin-left: 1px;">2</sup></span>
            </span>
        </div>
    `,
    "3n-3|n(3-2n)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">2</span>
                <span class="den" style="display:flex; align-items:center; gap:4px;">2 + <i style="font-family: serif;">π</i></span>
            </span>
        </div>
    `,
    "(n-1)(3n+4)+3|-(2n+4)(n^3)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">2</span>
                <span class="den" style="display:flex; align-items:center; gap:4px;">
                    2<i style="font-family: serif;">G</i> &minus; 1
                </span>
            </span>
        </div>
    `,
    "4n^2+6n+1|-2n(2n+3)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">3</span>
                <span class="den" style="display:flex; align-items:center; gap:4px;">
                    3 &minus; <i style="font-family: serif;">e</i>
                </span>
            </span>
        </div>
    `,
    "4n^2+2n-1|-2n(2n+1)+2": `
        <div class="math-row" style="display:flex; align-items:center; gap:4px;">
            <span>2 +</span>
            <span class="fraction-line-wrapper">
                <span class="num">2</span>
                <span class="den" style="display:flex; align-items:center; gap:4px;">
                    <i style="font-family: serif;">e</i> &minus; 2
                </span>
            </span>
        </div>
    `,
    "2n+3|n(n+4)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">8</span>
                <span class="den" style="display:flex; align-items:center; gap:4px;">
                    3<i style="font-family: serif;">π</i> &minus; 8
                </span>
            </span>
        </div>
    `,
    "3n-1|n(1-2n)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">2</span>
                <span class="den" style="display:flex; align-items:center; gap:4px;">
                    <i style="font-family: serif;">π</i> &minus; 2
                </span>
            </span>
        </div>
    `,
    "3n|(n+1)(1-2n)": `
        <div class="math-row" style="display:flex; align-items:center; gap:4px;">
            <span>1 +</span>
            <span class="fraction-line-wrapper">
                <span class="num"><i style="font-family: serif;">π</i></span>
                <span class="den">2</span>
            </span>
        </div>
    `,
    "3n(n-1)+1|(n^3)(1-2n)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">8</span>
                <span class="den"><i style="font-family: serif;">π</i><sup style="margin-left: 1px;">2</sup></span>
            </span>
        </div>
    `,
    "3n(n-1)+1|3n^3-2n^4": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">16</span>
                <span class="den" style="display:flex; align-items:center; gap:4px;">
                    4 + <i style="font-family: serif;">π</i><sup style="margin-left: 1px;">2</sup>
                </span>
            </span>
        </div>
    `,
    "5n^2-4n+1|2n^3-4n^4": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">18</span>
                <span class="den"><i style="font-family: serif;">π</i><sup style="margin-left: 1px;">2</sup></span>
            </span>
        </div>
    `,
    "n^3+(n-1)^3|-(n^6)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">1</span>
                <span class="den"><i style="font-family: serif;">&zeta;</i>(3)</span>
            </span>
        </div>
    `,
    "(n-1)(n+1)(3n+1)+2|4n^6-2n^5": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">5</span>
                <span class="den">2<i style="font-family: serif;">&zeta;</i>(3)</span>
            </span>
        </div>
    `,
    "10n^2-13n+5|-((2n-1)^4+(2n-1)^3)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">6</span>
                <span class="den" style="display:flex; align-items:center; gap:4px;">
                    8<i style="font-family: serif;">G</i> &minus; 
                    <i style="font-family: serif;">π</i> ln
                    <span class="paren-group">
                        <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                            <path d="M 9,1 C 0,10 0,30 9,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="paren-content" style="display:flex; align-items:center; gap:4px;">
                            2 + 
                            <span class="sqrt-wrapper">
                                <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                    <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                                </svg>
                                <span class="radicand">3</span>
                            </span>
                        </span>
                        <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                            <path d="M 1,1 C 10,10 10,30 1,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                        </svg>
                    </span>
                </span>
            </span>
        </div>
    `,
    "n+2|n": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">1</span>
                <span class="den" style="display:flex; align-items:center; gap:4px;">
                    6<i style="font-family: serif;">e</i> &minus; 16
                </span>
            </span>
        </div>
    `,
    "n+4|-n": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num"><i style="font-family: serif;">e</i></span>
                <span class="den" style="display:flex; align-items:center; gap:4px;">
                    6 &minus; 2<i style="font-family: serif;">e</i>
                </span>
            </span>
        </div>
    `,
    "2|(2n-1)^2+4": `
        <div class="math-row" style="display:flex; align-items:center; gap:4px;">
            <span>3 +</span>
            <span class="fraction-line-wrapper">
                <span class="num">4</span>
                <span class="den" style="display:flex; align-items:center; gap:4px;">
                    <i style="font-family: serif;">e</i><sup style="margin-left: 1px; margin-bottom: 20px;"><i style="font-family: serif;">π</i></sup> &minus; 1
                </span>
            </span>
        </div>
    `
};

function render() {
    const aStr = inputA.value.trim() || "0";
    const bStr = inputB.value.trim() || "0";

    display.innerHTML = buildFraction(aStr, bStr, 4, 1);

    const result = calculateValue(aStr, bStr);
    
    if (isNaN(result) || !isFinite(result)) {
        decimalValue.innerText = "---";
        exactContainer.style.opacity = "0";
        exactContainer.style.transform = "translateX(20px)";
        return; 
    } 

    decimalValue.innerText = result.toFixed(10) + "...";

    // 1. Check Known Formulas (Exact and Algebraic Equivalents)
    let matchedFormula = null;

    // Fast check: Direct string match (stripping spaces)
    const normA = aStr.toLowerCase().replace(/\s+/g, '');
    const normB = bStr.toLowerCase().replace(/\s+/g, '');
    const directKey = `${normA}|${normB}`;

    if (KNOWN_FORMULAS[directKey]) {
        matchedFormula = KNOWN_FORMULAS[directKey];
    } else {
        // Deep check: Test mathematical equivalence at arbitrary n values
        const testPoints = [2, 3, 5, 7]; // Testing at a few primes avoids false overlaps
        
        for (const key in KNOWN_FORMULAS) {
            const [keyA, keyB] = key.split('|');
            let isAEquivalent = true;
            let isBEquivalent = true;

            // Check if 'A' expressions are equivalent
            for (const n of testPoints) {
                const evalUserA = evaluateExpression(aStr, n);
                const evalKeyA = evaluateExpression(keyA, n);
                // Use a tiny epsilon margin for any JavaScript floating-point quirks
                if (Math.abs(evalUserA - evalKeyA) > 1e-9) {
                    isAEquivalent = false;
                    break;
                }
            }

            if (!isAEquivalent) continue; // Skip B check if A already failed

            // Check if 'B' expressions are equivalent
            for (const n of testPoints) {
                const evalUserB = evaluateExpression(bStr, n);
                const evalKeyB = evaluateExpression(keyB, n);
                if (Math.abs(evalUserB - evalKeyB) > 1e-9) {
                    isBEquivalent = false;
                    break;
                }
            }

            // If both match at all test points, we found our formula!
            if (isAEquivalent && isBEquivalent) {
                matchedFormula = KNOWN_FORMULAS[key];
                break;
            }
        }
    }

    // Apply the matched exact formula if found
    if (matchedFormula) {
        exactFormula.innerHTML = matchedFormula;
        exactContainer.style.opacity = "1";
        exactContainer.style.transform = "translateX(0px)";
        return;
    }

    // 2. Generic "Exact" Logic (Square Roots)
    const hasN = aStr.toLowerCase().includes('n') || bStr.toLowerCase().includes('n');
    const vA = evaluateExpression(aStr, 1);
    const vB = evaluateExpression(bStr, 1);
    
    let exactMarkup = "";

    if (vB === 0) {
        exactMarkup = `<span class="exact-integer">${vA}</span>`;
    } 
   else if (!hasN) {
    const disc = (vA * vA) + (4 * vB);
    if (disc >= 0) {
        const sqrtDisc = Math.sqrt(disc);
        // Determine if we add or subtract based on vA's sign
        const useMinus = vA < 0;
        const op = useMinus ? "-" : "+";
        const numerator = useMinus ? vA - sqrtDisc : vA + sqrtDisc;

        if (Number.isInteger(sqrtDisc)) {
            if (numerator % 2 === 0) {
                exactMarkup = `<span class="exact-integer">${numerator / 2}</span>`;
            } else {
                exactMarkup = `
                    <div class="math-row">
                        <span class="fraction-line-wrapper">
                            <span class="num">${numerator}</span>
                            <span class="den">2</span>
                        </span>
                    </div>`;
            }
        } else {
            exactMarkup = `
                <div class="math-row">
                    <span class="fraction-line-wrapper">
                        <span class="num" style="display:flex; align-items:center; gap:4px;">
                            ${vA} ${op} 
                            <span class="sqrt-wrapper">
                                <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                    <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                                </svg>
                                <span class="radicand">${disc}</span>
                            </span>
                        </span>
                        <span class="den">2</span>
                    </span>
                </div>`;
        }
    }
}

    // 3. Final Render
    if (exactMarkup) {
        exactFormula.innerHTML = exactMarkup;
        exactContainer.style.opacity = "1";
        exactContainer.style.transform = "translateX(0px)";
    } else {
        exactContainer.style.opacity = "0";
        exactContainer.style.transform = "translateX(20px)";
    }
}

[inputA, inputB].forEach(el => el.addEventListener('input', render));

const randomBtn = document.getElementById('randomBtn'); // New

// Random Button Logic
randomBtn.addEventListener('click', () => {
    // Get all keys (e.g., ["n-1|n", "n|n", ...])
    const formulas = Object.keys(KNOWN_FORMULAS);
    
    // Pick a random index
    const randomIndex = Math.floor(Math.random() * formulas.length);
    const randomFormula = formulas[randomIndex];
    
    // Split the key into A and B based on the '|' delimiter
    const [a, b] = randomFormula.split('|');
    
    // Update the input fields
    inputA.value = a;
    inputB.value = b;
    
    // Trigger the update
    render();
});


render();
