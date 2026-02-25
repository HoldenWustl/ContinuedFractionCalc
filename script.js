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

// State management
let isFactoredView = true;

document.getElementById('viewToggle').addEventListener('change', (e) => {
    isFactoredView = e.target.checked;
    document.getElementById('toggleLabel').innerText = isFactoredView ? "Factored View" : "Simplified View";
    
    // Call your main render function here to update the display
    render();
});

function getDisplayText(expr, n, isForA = false) {
    if (!expr || expr.trim() === "") return "";
    
    // NEW Helper: Formats numbers to max 3 decimal places, dropping trailing zeros
    const formatNum = (num) => {
        if (typeof num !== 'number') return num;
        return parseFloat(num.toFixed(3));
    };

    // Mode 1: Simplified View
    if (!isFactoredView) {
        let val = evaluateExpression(expr, n);
        return typeof val === 'number' ? formatNum(val).toString() : val;
    }

    let formula = expr.toLowerCase();

    // 1. Normalize all powers to caret first, then handle implicit multiplication
    formula = formula.replace(/\*\*/g, '^');
    formula = formula.replace(/(\d|n|\))(?=[n\(])|(\))(?=\d)/g, '$1*');

    // Helper: Checks if a string is strictly a linear term
    const isLinear = (str) => {
        if (/[\^\(\)]/.test(str)) return false;
        const nMatches = str.match(/n/g);
        if (nMatches && nMatches.length > 1) return false;
        return true;
    };

    // Helper: Strips completely redundant outer parentheses
    const stripOuterParens = (str) => {
        let s = str.trim();
        while (s.startsWith('(') && s.endsWith(')')) {
            let pDepthCheck = 0;
            let isFullyEnclosed = true;
            for (let i = 0; i < s.length - 1; i++) {
                if (s[i] === '(') pDepthCheck++;
                else if (s[i] === ')') pDepthCheck--;
                if (pDepthCheck === 0) { isFullyEnclosed = false; break; }
            }
            if (isFullyEnclosed) {
                s = s.substring(1, s.length - 1).trim();
            } else {
                break;
            }
        }
        return s;
    };

    // Helper: Checks if original formula has top-level addition/subtraction
    const hasTopLevelAddSub = (str) => {
        let s = str.trim();
        if (s.startsWith('+') || s.startsWith('-')) s = s.substring(1);
        let d = 0;
        for (let i = 0; i < s.length; i++) {
            let char = s[i];
            if (char === '(') d++;
            else if (char === ')') d--;
            else if (d === 0 && (char === '+' || char === '-')) {
                if (i > 0 && !['*', '^', '/', '(', 'e'].includes(s[i - 1])) {
                    return true;
                }
            }
        }
        return false;
    };

    // Helper: Checks if an evaluated string actually NEEDS parentheses restored
    const needsParensRestored = (str) => {
        let text = str.replace(/<[^>]*>/g, '').trim();
        if (/^\+?(?:\d+(?:\.\d+)?|\.\d+)$/.test(text)) {
            return false;
        }
        return true;
    };

    // --- The Recursive Parser ---
    const processNode = (nodeStr) => {
        nodeStr = nodeStr.trim();
        if (!nodeStr) return "";

        // 1. Extract leading signs for this specific chunk robustly
        let signMult = 1;
        let hasSign = false;
        while (nodeStr.startsWith('-') || nodeStr.startsWith('+')) {
            hasSign = true;
            if (nodeStr[0] === '-') signMult *= -1;
            nodeStr = nodeStr.substring(1).trim();
        }
        let sign = "";
        if (hasSign) {
            sign = signMult === -1 ? '-' : '+';
        }

        // 2. Strip outer parens, but remember if we did so we can restore them visually
        let originalNodeStr = nodeStr;
        nodeStr = stripOuterParens(nodeStr);
        let didStripParens = (originalNodeStr !== nodeStr);

        // 3. BASE CASE: Completely Linear Expression
        if (isLinear(nodeStr)) {
            // Evaluate using the original unstripped string to maintain safe precedence
            let evalStr = sign + originalNodeStr;
            let val = formatNum(evaluateExpression(evalStr, n)); 
            
            let res;
            if (evalStr.includes('n')) {
                // Removed the hardcoded val < 0 parenthesis wrap
                res = `<span class="n-val">${val}</span>`;
            } else {
                res = val.toString();
            }

            // ONLY restore parens if we stripped them AND the resulting value is complex
            if (didStripParens && needsParensRestored(res)) res = `(${res})`;
            
            // Return 'res' directly. We do NOT prepend 'sign' again here because 
            // the sign was already passed into evaluateExpression above!
            return res;
        }

        // 4. RECURSIVE CASE 1: Collect & Group Top-Level Polynomial Terms
        let depth = 0;
        let topLevelTerms = [];
        let currentTerm = "";
        
        let parseStr = nodeStr;
        if (parseStr[0] !== '+' && parseStr[0] !== '-') {
            parseStr = '+' + parseStr;
        }

        for (let i = 0; i < parseStr.length; i++) {
            let char = parseStr[i];
            if (char === '(') depth++;
            else if (char === ')') depth--;
            
            if (depth === 0 && (char === '+' || char === '-')) {
                if (i > 0 && ['*', '^', '/', '(', 'e'].includes(parseStr[i - 1])) {
                    currentTerm += char;
                } else {
                    if (currentTerm.trim() !== "") topLevelTerms.push(currentTerm.trim());
                    currentTerm = char;
                }
            } else {
                currentTerm += char;
            }
        }
        if (currentTerm.trim() !== "") topLevelTerms.push(currentTerm.trim());

        if (topLevelTerms.length > 1) {
            let linearEvalStr = "";
            let nonLinearParts = [];
            let hasNInLinear = false;

            topLevelTerms.forEach(term => {
                if (isLinear(term)) {
                    linearEvalStr += term;
                    if (term.includes('n')) hasNInLinear = true;
                } else {
                    nonLinearParts.push(processNode(term));
                }
            });

            let resStr = nonLinearParts.join('');

            if (linearEvalStr.trim() !== "") {
                let val = formatNum(evaluateExpression(linearEvalStr, n)); 
                
                if (nonLinearParts.length === 0) {
                    let displayVal = val.toString();
                    if (hasNInLinear) {
                        // Removed the hardcoded val < 0 parenthesis wrap
                        displayVal = `<span class="n-val">${val}</span>`;
                    }
                    resStr = displayVal;
                } else if (val !== 0) { 
                    let displayVal = val > 0 ? `+${val}` : `${val}`;
                    if (hasNInLinear) {
                        displayVal = val > 0 ? `+<span class="n-val">${val}</span>` : `-<span class="n-val">${Math.abs(val)}</span>`;
                    }
                    resStr += displayVal;
                }
            }

            if (resStr.startsWith('+') && !nodeStr.startsWith('+')) {
                resStr = resStr.substring(1);
            }
            
            if (didStripParens && needsParensRestored(resStr)) resStr = `(${resStr})`;
            return sign ? `${sign}${resStr}` : resStr;
        }

        // 5. RECURSIVE CASE 2: Split Multiplications (* at depth 0)
        depth = 0;
        let splitIdx = -1;
        for (let i = nodeStr.length - 1; i >= 0; i--) {
            if (nodeStr[i] === ')') depth++;
            else if (nodeStr[i] === '(') depth--;
            else if (depth === 0 && nodeStr[i] === '*') {
                splitIdx = i;
                break;
            }
        }

        if (splitIdx !== -1) {
            let left = nodeStr.substring(0, splitIdx);
            let right = nodeStr.substring(splitIdx + 1);
            
            let leftRes = processNode(left);
            let rightRes = processNode(right);
            
            let joiner = rightRes.startsWith('(') ? '' : '&middot;';
            let res = `${leftRes}${joiner}${rightRes}`;
            
            if (didStripParens && needsParensRestored(res)) res = `(${res})`;
            return sign ? `${sign}${res}` : res;
        }

        // 6. RECURSIVE CASE 3: Split Exponents (^ at depth 0)
        depth = 0;
        splitIdx = -1;
        for (let i = nodeStr.length - 1; i >= 0; i--) {
            if (nodeStr[i] === ')') depth++;
            else if (nodeStr[i] === '(') depth--;
            else if (depth === 0 && nodeStr[i] === '^') {
                splitIdx = i;
                break;
            }
        }

        if (splitIdx !== -1) {
            let base = nodeStr.substring(0, splitIdx);
            let exp = nodeStr.substring(splitIdx + 1);
            
            let res = `${processNode(base)}<sup>${processNode(exp)}</sup>`;
            if (didStripParens && needsParensRestored(res)) res = `(${res})`;
            return sign ? `${sign}${res}` : res;
        }

        return sign + nodeStr;
    };

    let finalDisplay = processNode(formula);

    return finalDisplay;
}

function buildFraction(exprA, exprB, depth, n) {
    if (depth <= 0) {
        return `<div class="terminal-dots">...</div>`;
    }

    // Use getDisplayText for the UI, but evaluateExpression stays the same for internal math
    const displayA = getDisplayText(exprA, n, true); 
    const displayB = getDisplayText(exprB, n, false);

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
const termCount = document.getElementById('termCount');

function calculateValue(exprA, exprB, iterations = 2500) {
    const compute = (n) => {
        let val = evaluateExpression(exprA, n);
        for (let i = n - 1; i >= 1; i--) {
            let a = evaluateExpression(exprA, i);
            let b = evaluateExpression(exprB, i);
            val = a + (b / val);
        }
        return val;
    };

    // 1. Calculate the gap at the halfway mark
    let halfN = Math.floor(iterations / 2);
    let gapHalf = Math.abs(compute(halfN) - compute(halfN - 1));

    // 2. Calculate the gap at the very end
    let gapFull = Math.abs(compute(iterations) - compute(iterations - 1));

    // 3. The Plateau Test (Scale-Invariant)
    // If the full gap is still 95%+ of the half gap, it has hit a wall.
    // We also include a tiny base tolerance (1e-10) to prevent floating point noise 
    // from triggering false positives on fast-converging fractions.
    
    if (gapFull > 1e-10 && (gapFull / gapHalf) > 0.95) {
        return NaN; // Divergence by oscillation detected
    }

    // If it's still actively shrinking, return the best approximation
    return compute(iterations); 
}

const exactContainer = document.getElementById('exactContainer');
const exactFormula = document.getElementById('exactFormula');
const KNOWN_FORMULAS = {
    "n-1|n": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">1</span>
                <span class="den"><i class="math-serif">e</i> - 1</span>
            </span>
        </div>
    `,
     "n|n": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">1</span>
                <span class="den"><i class="math-serif">e</i> - 2</span>
            </span>
        </div>
    `,
    "n|1": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num"><i class="math-serif">I</i><sub>0</sub>(2)</span>
                <span class="den"><i class="math-serif">I</i><sub>1</sub>(2)</span>
            </span>
        </div>
    `,
    "-n(-1)^n|1": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num"><i class="math-serif">J</i><sub>0</sub>(2)</span>
                <span class="den"><i class="math-serif">J</i><sub>1</sub>(2)</span>
            </span>
        </div>
    `,
    "n|-1": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num"><i class="math-serif">J</i><sub>0</sub>(2)</span>
                <span class="den"><i class="math-serif">J</i><sub>1</sub>(2)</span>
            </span>
        </div>
    `,
    "-2n(-1)^n|1": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num"><i class="math-serif">J</i><sub>0</sub>(1)</span>
                <span class="den"><i class="math-serif">J</i><sub>1</sub>(1)</span>
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
                <span class="den flex-row gap-2">
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand pr-2"><i class="math-serif">eπ</i></span>
                    </span>
                    <span>erfc</span>
                    
                    <span class="paren-group">
                        <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                            <path d="M 9,1 C 0,10 0,30 9,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="paren-content">
                            <div class="fraction-line-wrapper text-sm">
                                <span class="num inner-num">1</span>
                                <span class="den pt-1">
                                    <span class="sqrt-wrapper scale-80">
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
                <span class="den flex-row gap-4">
                    <span class="sqrt-wrapper relative">
                        <span class="sqrt-index">4</span>
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand"><i class="math-serif">e</i></span>
                    </span>
                    
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand"><i class="math-serif">π</i></span>
                    </span>

                    <span>erfc</span>
                    
                    <span class="paren-group">
                        <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                            <path d="M 9,1 C 0,10 0,30 9,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="paren-content">
                            <div class="fraction-line-wrapper text-sm">
                                <span class="num inner-num">1</span>
                                <span class="den pt-1">2</span>
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
                <span class="den"><i class="math-serif">π</i></span>
            </span>
        </div>
    `,
    "6|(2n-1)^2": `
        <div class="math-row flex-row gap-6">
            <span>3</span>
            <span>+</span>
            <i class="math-serif">π</i>
        </div>
    `,
    "2n-1|1": `
        <div class="math-row flex-row items-center">
            <span class="fraction-line-wrapper">
                
                <span class="num flex-row items-center justify-center px-4">
                    <span>2</span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-2 px-4">
                    <span><i class="math-serif">e</i><sup>2</sup></span>
                    <span class="operator">&minus;</span>
                    <span>1</span>
                </span>
                
            </span>
            
            <span class="operator mx-2">+</span>
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
        <div class="math-row flex-row gap-8">
            <span>1</span>
            <span>+</span>
            <span class="fraction-line-wrapper">
                <span class="num">4</span>
                <span class="den"><i class="math-serif">π</i></span>
            </span>
        </div>
    `,
    "2n-1|2n": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">1</span>
                <span class="den flex-row gap-6">
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand"><i class="math-serif">e</i></span>
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
                <span class="num"><i class="math-serif">I</i><sub>0</sub>(1)</span>
                <span class="den"><i class="math-serif">I</i><sub>1</sub>(1)</span>
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
                <span class="num"><i class="math-serif">e</i></span>
                <span class="den"><i class="math-serif">e</i> &minus; 1</span>
            </span>
        </div>
    `,
    "n+2|-n": `
        <div class="math-row">
            <span><i class="math-serif">e</i></span>
        </div>
    `,
    "n|n+1": `
        <div class="math-row">
            <span><i class="math-serif">e</i> &minus; 1</span>
        </div>
    `,
    "4n-2|1": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num"><i class="math-serif">e</i> &plus; 1</span>
                <span class="den"><i class="math-serif">e</i> &minus; 1</span>
            </span>
        </div>
    `,
    "12|(4n-2)^2": `
        <div class="math-row flex-row gap-6">
            <span>2<i class="math-serif">π</i></span>
            <span>+</span>
            <span>6</span>
        </div>
    `,
    "4|(2n-1)^2": `
        <div class="math-row flex-row gap-8">
            <span>2</span>
            <span>+</span>
            <span class="fraction-line-wrapper">
                <span class="num flex-row gap-2">
                    <span class="math-serif">&Gamma;</span>
                    
                    <span class="inline-flex-row">
                        <span class="paren-group">
                            <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                                <path d="M 9,1 C 0,10 0,30 9,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                            </svg>
                            <span class="paren-content">
                                <div class="fraction-line-wrapper text-sm">
                                    <span class="num inner-num">1</span>
                                    <span class="den pt-1">4</span>
                                </div>
                            </span>
                            <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                                <path d="M 1,1 C 10,10 10,30 1,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                            </svg>
                        </span>
                        <sup class="sup-adjust">4</sup>
                    </span>
                    
                </span>
                <span class="den">
                    8<i class="math-serif">π</i><sup class="ml-1">2</sup>
                </span>
            </span>
        </div>
    `,
    "1|n(n+1)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">2</span>
                <span class="den"><i class="math-serif">π</i> &minus; 2</span>
            </span>
        </div>
    `,
    "2|2n(2n+1)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">2</span>
                <span class="den"><i class="math-serif">&#982;</i> &minus; 2</span>
            </span>
        </div>
    `,
    "8(n-1)|(2n-1)^4": `
        <div class="math-row flex-row gap-8">
            <span class="fraction-line-wrapper">
                <span class="num">1</span>
                <span class="den"><i class="math-serif">G</i></span>
            </span>
            <span>&minus;</span>
            <span>1</span>
        </div>
    `,
    "2n-1|n^4": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">12</span>
                <span class="den"><i class="math-serif">π</i><sup class="ml-1">2</sup></span>
            </span>
        </div>
    `,
    "n+1|n": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">1</span>
                <span class="den">2<i class="math-serif">e</i> &minus; 5</span>
            </span>
        </div>
    `,
    "2n-2|2n-1": `
        <div class="math-row flex-row gap-8">
            <span class="fraction-line-wrapper">
                <span class="num">
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand">2<i class="math-serif">e</i></span>
                    </span>
                </span>
                <span class="den flex-row gap-2">
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand"><i class="math-serif">π</i></span>
                    </span>
                    <span class="ml-2">erfi</span>
                    <span class="paren-group">
                        <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                            <path d="M 9,1 C 0,10 0,30 9,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="paren-content">
                            <div class="fraction-line-wrapper text-sm">
                                <span class="num inner-num">1</span>
                                <span class="den pt-1">
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
            
            <span class="flex gap-8 translate-y-half">
                <span>&minus;</span>
                <span>1</span>
            </span>
        </div>
    `,
    "(17n(n-1)+5)(2n-1)|-(n^6)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">6</span>
                <span class="den"><i class="math-serif">&zeta;</i>(3)</span>
            </span>
        </div>
    `,
    "n|n(n+1)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num flex-row gap-4">
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
                <span class="num flex-row gap-4">
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
                <span class="num flex-row gap-4">
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
     "11n(n-1)+3|n^4": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">30</span>
                <span class="den"><i class="math-serif">π</i><sup class="ml-1">2</sup></span>
            </span>
        </div>
    `,
    "2n(n-1)+1|-(n^4)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">6</span>
                <span class="den"><i class="math-serif">π</i><sup class="ml-1">2</sup></span>
            </span>
        </div>
    `,
    "n(3n-3)+1|-2(n^4)": `
        <div class="math-row flex-row gap-8">
            <span class="fraction-line-wrapper">
                <span class="num">1</span>
                <span class="den">2<i class="math-serif">G</i></span>
            </span>
        </div>
    `,
    "2n|-(n^2)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">&minus;1</span>
                <span class="den"><i class="math-serif">e</i> Ei(&minus;1)</span>
            </span>
        </div>
    `,
    "2n+1|-n(n+1)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">1</span>
                <span class="den flex-row gap-4">1 + <i class="math-serif">e</i> Ei(&minus;1)</span>
            </span>
        </div>
    `,
    "1|n/2": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">1</span>
                <span class="den flex-row gap-4">
                    
                    <span><i class="math-serif">e</i></span>
                    
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand"><i class="math-serif">π</i></span>
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
                <span class="den flex-row gap-4"><i class="math-serif">π</i> &minus; 2</span>
            </span>
        </div>
    `,
    "n+3|-n": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num"><i class="math-serif">e</i></span>
                <span class="den flex-row gap-4"><i class="math-serif">e</i> &minus; 2</span>
            </span>
        </div>
    `,
    "3n|-n(2n-1)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">4</span>
                <span class="den flex-row gap-4">3<i class="math-serif">π</i> &minus; 8</span>
            </span>
        </div>
    `,
    "7n(n-1)+2|8n^4": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">24</span>
                <span class="den"><i class="math-serif">π</i><sup class="ml-1">2</sup></span>
            </span>
        </div>
    `,
    "3n-3|n(3-2n)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">2</span>
                <span class="den flex-row gap-4">2 + <i class="math-serif">π</i></span>
            </span>
        </div>
    `,
   "(n-1)(3n+4)+3|-(2n+4)(n^3)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">2</span>
                <span class="den flex-row gap-4">
                    2<i class="math-serif">G</i> &minus; 1
                </span>
            </span>
        </div>
    `,
    "2n(2n+3)+1|-2n(2n+3)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">3</span>
                <span class="den flex-row gap-4">
                    3 &minus; <i class="math-serif">e</i>
                </span>
            </span>
        </div>
    `,
    "2n(2n+1)-1|-2n(2n+1)+2": `
        <div class="math-row flex-row gap-4">
            <span>2 +</span>
            <span class="fraction-line-wrapper">
                <span class="num">2</span>
                <span class="den flex-row gap-4">
                    <i class="math-serif">e</i> &minus; 2
                </span>
            </span>
        </div>
    `,
    "2n+3|n(n+4)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">8</span>
                <span class="den flex-row gap-4">
                    3<i class="math-serif">π</i> &minus; 8
                </span>
            </span>
        </div>
    `,
    "3n-1|n(1-2n)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">2</span>
                <span class="den flex-row gap-4">
                    <i class="math-serif">π</i> &minus; 2
                </span>
            </span>
        </div>
    `,
    "3n|(n+1)(1-2n)": `
        <div class="math-row flex-row gap-4">
            <span>1 +</span>
            <span class="fraction-line-wrapper">
                <span class="num"><i class="math-serif">π</i></span>
                <span class="den">2</span>
            </span>
        </div>
    `,
    "3n(n-1)+1|(n^3)(1-2n)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">8</span>
                <span class="den"><i class="math-serif">π</i><sup class="ml-1">2</sup></span>
            </span>
        </div>
    `,
    "3n(n-1)+1|3n^3-2n^4": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">16</span>
                <span class="den flex-row gap-4">
                    4 + <i class="math-serif">π</i><sup class="ml-1">2</sup>
                </span>
            </span>
        </div>
    `,
    "n(5n-4)+1|-2n^3(2n-1)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">18</span>
                <span class="den"><i class="math-serif">π</i><sup class="ml-1">2</sup></span>
            </span>
        </div>
    `,
    "n^3+(n-1)^3|-(n^6)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">1</span>
                <span class="den"><i class="math-serif">&zeta;</i>(3)</span>
            </span>
        </div>
    `,
    "(n-1)(n+1)(3n+1)+2|4n^6-2n^5": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">5</span>
                <span class="den">2<i class="math-serif">&zeta;</i>(3)</span>
            </span>
        </div>
    `,
    "n(10n-13)+5|-((2n-1)^4)-(2n-1)^3": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">6</span>
                <span class="den flex-row gap-4">
                    8<i class="math-serif">G</i> &minus; 
                    <i class="math-serif">π</i> ln
                    <span class="paren-group">
                        <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                            <path d="M 9,1 C 0,10 0,30 9,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="paren-content flex-row gap-4">
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
                <span class="den flex-row gap-4">
                    6<i class="math-serif">e</i> &minus; 16
                </span>
            </span>
        </div>
    `,
    "n+4|-n": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num"><i class="math-serif">e</i></span>
                <span class="den flex-row gap-4">
                    6 &minus; 2<i class="math-serif">e</i>
                </span>
            </span>
        </div>
    `,
   "2|(2n-1)^2+4": `
        <div class="math-row flex-row gap-4">
            <span>3 +</span>
            <span class="fraction-line-wrapper">
                <span class="num">4</span>
                <span class="den flex-row gap-4">
                    <i class="math-serif">e</i><sup class="ml-1 mb-20"><i class="math-serif">π</i></sup> &minus; 1
                </span>
            </span>
        </div>
    `,
    "(2n+1)^2|-(n^2)(n+2)^2": `
        <div class="math-row flex-row gap-4">
            <span>4 +</span>
            <span class="fraction-line-wrapper">
                <span class="num">8</span>
                <span class="den">
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand">3</span>
                    </span>
                </span>
            </span>
        </div>
    `,
    "1|3n(3n+2)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num flex-row gap-2">
                    2
                    <span class="paren-group">
                        <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                            <path d="M 9,1 C 0,10 0,30 9,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="paren-content flex-row gap-2">
                            1 + 
                            <span class="sqrt-wrapper">
                                <sup class="cube-root-idx">3</sup>
                                <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                    <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                                </svg>
                                <span class="radicand">2</span>
                            </span>
                        </span>
                        <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                            <path d="M 1,1 C 10,10 10,30 1,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                        </svg>
                    </span>
                    <sup class="ml-n2 mb-20">2</sup>
                </span>
                <span class="den">3</span>
            </span>
        </div>
    `,
    "7n-5|4n(2-3n)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">1</span>
                <span class="den flex-row gap-4">
                    <span class="sqrt-wrapper">
                        <sup class="cube-root-idx">3</sup>
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand">2</span>
                    </span>
                    &minus;
                    <span class="fraction-line-wrapper text-85">
                        <span class="num">1</span>
                        <span class="den">2</span>
                    </span>
                </span>
            </span>
        </div>
    `,
    "18n-9|1-9n^2": `
        <div class="math-row flex-row gap-4">
            <span>1 +</span>
            <span class="fraction-line-wrapper">
                <span class="num">2</span>
                <span class="den flex-row gap-4">
                    <span class="sqrt-wrapper">
                        <sup class="cube-root-idx">3</sup>
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand">2</span>
                    </span>
                    &minus; 1
                </span>
            </span>
        </div>
    `,
    "4|(2n-1)(2n+1)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num flex-row gap-4">
                    <i class="math-serif">π</i> + 2
                </span>
                <span class="den flex-row gap-4">
                    <i class="math-serif">π</i> &minus; 2
                </span>
            </span>
        </div>
    `,
    "2|n^2": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">2</span>
                <span class="den flex-row gap-4">
                    4 &minus; <i class="math-serif">π</i>
                </span>
            </span>
        </div>
    `,
    "2n-1|3n^2": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num flex-row gap-2">
                    3
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand">3</span>
                    </span>
                </span>
                <span class="den">
                    <i class="math-serif">π</i>
                </span>
            </span>
        </div>
    `,
    "3(2n-1)|3n^2": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num flex-row gap-2">
                    6
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand">3</span>
                    </span>
                </span>
                <span class="den">
                    <i class="math-serif">π</i>
                </span>
            </span>
        </div>
    `,
    "3n-1|-2n^2": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">1</span>
                <span class="den">ln(2)</span>
            </span>
        </div>
    `,
    "5(2n-1)|-9n^2": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">3</span>
                <span class="den">ln(2)</span>
            </span>
        </div>
    `,
    "4n-2|-2n^2": `
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
                <span class="den flex-row gap-4">
                    ln
                    <span class="paren-group">
                        <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                            <path d="M 9,1 C 0,10 0,30 9,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="paren-content flex-row gap-4">
                            1 + 
                            <span class="sqrt-wrapper">
                                <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                    <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                                </svg>
                                <span class="radicand">2</span>
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
    "3n^2-1|2n^3(2n-1)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">1</span>
                <span class="den flex-row gap-2">
                    2 ln<sup class="mb-20">2</sup>
                    <span class="paren-group">
                        <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                            <path d="M 9,1 C 0,10 0,30 9,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="paren-content">
                            <i class="math-serif">φ</i>
                        </span>
                        <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                            <path d="M 1,1 C 10,10 10,30 1,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                        </svg>
                    </span>
                </span>
            </span>
        </div>
    `,
    "(n(3n-3)+1)(2n-1)|3n^6": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num flex-row gap-2">
                    81
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand">3</span>
                    </span>
                </span>
                <span class="den flex-row gap-2" style="justify-content: center;">
                    4 <i class="math-serif">π</i><sup class="mb-20">3</sup>
                </span>
            </span>
        </div>
    `,
    "n(3n-3)+1|n^6": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">4</span>
                <span class="den flex-row gap-4">
                    3 <i class="math-serif">ζ</i>(3)
                </span>
            </span>
        </div>
    `,
   "(2n(n-1)+1)(2n-1)|n^8": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">720</span>
                <span class="den flex-row gap-2">
                    7 <i class="math-serif">π</i><sup class="mb-20">4</sup>
                </span>
            </span>
        </div>
    `,
    "n^4+(n-1)^4|-(n^8)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">90</span>
                <span class="den">
                    <i class="math-serif">π</i><sup class="mb-20">4</sup>
                </span>
            </span>
        </div>
    `,
    "n(5n-5)+3|n^6": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">4</span>
                <span class="den flex-row gap-4">
                    16 &minus; 16 ln(2) &minus; 3 <i class="math-serif">ζ</i>(3)
                </span>
            </span>
        </div>
    `,
    "4n-3|n^2(2n-1)^2": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">2</span>
                <span class="den flex-row gap-4">
                    <i class="math-serif">π</i> &minus; 2 ln(2)
                </span>
            </span>
        </div>
    `,
    "4n-1|n^2(2n+1)^2": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">2</span>
                <span class="den flex-row gap-4">
                    <i class="math-serif">π</i> + 2 ln(2) &minus; 4
                </span>
            </span>
        </div>
    `,
    "6n-3|16n^4-n^2": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">4</span>
                <span class="den flex-row gap-4">
                    6 ln(2) &minus; <i class="math-serif">π</i>
                </span>
            </span>
        </div>
    `,
    "2n-1|n^2(4n-3)(4n+3)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">12</span>
                <span class="den flex-row gap-4">
                    6 ln(2) + <i class="math-serif">π</i>
                </span>
            </span>
        </div>
    `,
    "1|9n^2": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">9</span>
                <span class="den flex-row gap-4">
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand">3</span>
                    </span>
                    <i class="math-serif">π</i> &minus; 3 ln(2)
                </span>
            </span>
        </div>
    `,
    "9n-5|-6n(3n-1)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">9</span>
                <span class="den flex-row gap-4">
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand">3</span>
                    </span>
                    <i class="math-serif">π</i> &minus; 3 ln(2)
                </span>
            </span>
        </div>
    `,
    "7n-2|8n^2": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">12</span>
                <span class="den flex-row gap-4">
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand">3</span>
                    </span>
                    <i class="math-serif">π</i> &minus; 3 ln(3)
                </span>
            </span>
        </div>
    `,
    "2n-1|n^2(3n-2)(3n+2)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">24</span>
                <span class="den flex-row gap-4">
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand">3</span>
                    </span>
                    <i class="math-serif">π</i> + 9 ln(3)
                </span>
            </span>
        </div>
    `,
    "1|(n+1)(4n)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">8</span>
                <span class="den flex-row gap-4">
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand">2</span>
                    </span>
                    <i class="math-serif">π</i> + 2
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand">2</span>
                    </span>
                    ln
                    <span class="paren-group">
                        <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                            <path d="M 9,1 C 0,10 0,30 9,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="paren-content flex-row gap-4">
                            1 + 
                            <span class="sqrt-wrapper">
                                <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                    <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                                </svg>
                                <span class="radicand">2</span>
                            </span>
                        </span>
                        <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                            <path d="M 1,1 C 10,10 10,30 1,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                        </svg>
                    </span>
                    &minus; 4
                </span>
            </span>
        </div>
    `,
    "3|4n^2": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">4</span>
                <span class="den flex-row gap-4">
                    8 &minus; 
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand">2</span>
                    </span>
                    <i class="math-serif">π</i> &minus; 2
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand">2</span>
                    </span>
                    ln
                    <span class="paren-group">
                        <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                            <path d="M 9,1 C 0,10 0,30 9,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="paren-content flex-row gap-4">
                            1 + 
                            <span class="sqrt-wrapper">
                                <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                    <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                                </svg>
                                <span class="radicand">2</span>
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
    "1|4n^2": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num flex-row justify-center gap-2">
                    2
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand">2</span>
                    </span>
                </span>
                <span class="den flex-row gap-4">
                    <i class="math-serif">π</i> &minus; 2 ln
                    <span class="paren-group">
                        <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                            <path d="M 9,1 C 0,10 0,30 9,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="paren-content flex-row gap-4">
                            1 + 
                            <span class="sqrt-wrapper">
                                <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                    <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                                </svg>
                                <span class="radicand">2</span>
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
   "2n-1|4n^4": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">4</span>
                <span class="den flex-row gap-4">
                    <i class="math-serif">π</i><sup class="mb-20">2</sup> &minus; 8 <i class="math-serif">G</i>
                </span>
            </span>
        </div>
    `,
    "6n-3|4n^4": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">4</span>
                <span class="den flex-row gap-4">
                    <i class="math-serif">π</i><sup class="mb-20">2</sup> + 8 <i class="math-serif">G</i> &minus; 16
                </span>
            </span>
        </div>
    `,
    "n(3n-2)+1|-2n^4": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">12</span>
                <span class="den flex-row gap-4">
                    <i class="math-serif">π</i><sup class="mb-20">2</sup> &minus; 6 ln<sup class="mb-20">2</sup>(2)
                </span>
            </span>
        </div>
    `,
    "(8n(n-1)+5)(2n-1)|-((2n)^6)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">8</span>
                <span class="den flex-row gap-4">
                    28 <i class="math-serif">ζ</i>(3) &minus; <i class="math-serif">π</i><sup class="mb-20">3</sup>
                </span>
            </span>
        </div>
    `,
    "n(n+2)|n^2(n+3)": `
        <div class="math-row">
            <span class="fraction-line-wrapper">
                <span class="num">3</span>
                <span class="den flex-row gap-4">
                    4 <i class="math-serif">e</i> &minus; 10
                </span>
            </span>
        </div>
    `,
    "n+2|-2n": `
        <div class="math-row flex-row gap-4">
            <span class="fraction-line-wrapper flex-col items-center">
                <span class="num flex-row justify-center gap-2 px-4">
                    2<i class="math-serif">e</i><sup class="mb-20">2</sup>
                </span>
                <span class="line fraction-line"></span>
                <span class="den flex-row gap-2 px-4">
                    <i class="math-serif">e</i><sup class="mb-20">2</sup> &minus; 1
                </span>
            </span>
        </div>
    `,
    "n|2n+2": `
        <div class="math-row flex-row gap-4">
            <span class="fraction-line-wrapper flex-col items-center">
                <span class="num flex-row gap-2 px-4">
                    <i class="math-serif">e</i><sup class="mb-20">2</sup> &minus; 3
                </span>
                <span class="line fraction-line"></span>
                <span class="den px-4">2</span>
            </span>
        </div>
    `,
    "n+3|-3n": `
        <div class="math-row flex-row gap-4">
            <span class="fraction-line-wrapper flex-col items-center">
                <span class="num flex-row justify-center gap-2 px-4">
                    3<i class="math-serif">e</i><sup class="mb-20">3</sup>
                </span>
                <span class="line fraction-line"></span>
                <span class="den flex-row gap-2 px-4">
                    <i class="math-serif">e</i><sup class="mb-20">3</sup> &minus; 1
                </span>
            </span>
        </div>
    `,
    "n+1|3n+6": `
        <div class="math-row flex-row gap-4">
            <span class="fraction-line-wrapper flex-col items-center">
                <span class="num px-4">27</span>
                <span class="line fraction-line"></span>
                <span class="den flex-row gap-2 px-4">
                    <i class="math-serif">e</i><sup class="mb-20">3</sup> &minus; 13
                </span>
            </span>
        </div>
    `,
    "4n+6|9": `
        <div class="math-row flex-row gap-8">
            <span class="fraction-line-wrapper flex-col items-center">
                <span class="num px-4">54</span>
                <span class="line fraction-line"></span>
                <span class="den flex-row gap-2 px-4">
                    <i class="math-serif">e</i><sup class="mb-20">3</sup> &minus; 13
                </span>
            </span>
            <span class="operator text-12 lh-0">+</span>
            <span class="integer text-11">3</span>
        </div>
    `,
    "4|(2n)^2+1": `
        <div class="math-row flex-row gap-4">
            <i class="math-serif text-12">e</i>
            <sup class="text-07 mb-25 flex-col items-center">
                <span class="px-2">π</span>
                <span class="fraction-line"></span>
                <span class="px-2">2</span>
            </sup>
        </div>
    `,
    "2|(2n+1)^2+1": `
        <div class="math-row flex-row gap-4">
            <i class="math-serif text-12">e</i>
            <sup class="text-07 mb-25 flex-col items-center">
                <span class="px-2">π</span>
                <span class="fraction-line"></span>
                <span class="px-2">2</span>
            </sup>
            <span class="operator text-12 lh-0 ml-2">+</span>
            <span class="integer text-11">1</span>
        </div>
    `,
  "6n-3|3n^2+1": `
        <div class="math-row flex-row items-center">
            <span class="fraction-line-wrapper">
                <span class="num px-4" style="display: grid; place-items: center;">
                    <span style="grid-area: 1 / 1;">2</span>
                    <span style="grid-area: 1 / 1; visibility: hidden; pointer-events: none;">
                        <sup class="text-07 mb-25 flex-col items-center">
                            <span class="px-2">π</span>
                            <span class="fraction-line"></span>
                            <span class="px-2 flex-row items-center gap-2">
                                3
                                <span class="sqrt-wrapper">
                                    <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                        <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                                    </svg>
                                    <span class="radicand">3</span>
                                </span>
                            </span>
                        </sup>
                    </span>
                </span>
                <span class="den flex-row items-center gap-2 px-4">
                    <span class="flex-row items-center">
                        <i class="math-serif">e</i>
                        <sup class="text-07 mb-25 flex-col items-center">
                            <span class="px-2">π</span>
                            <span class="fraction-line"></span>
                            <span class="px-2 flex-row items-center gap-2">
                                3
                                <span class="sqrt-wrapper">
                                    <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                        <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                                    </svg>
                                    <span class="radicand">3</span>
                                </span>
                            </span>
                        </sup>
                    </span>
                    &minus; 1
                </span>
            </span>
            <span class="operator text-12 lh-0 ml-2">+</span>
            <span class="integer text-11 ml-2">1</span>
        </div>
    `,
   "80n-40|(4n-1)^2(4n+1)^2": `
        <div class="math-row flex-row items-center">
            <span class="fraction-line-wrapper">
                <span class="num flex-row items-center gap-2 px-4">
                    8
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand">π</span>
                    </span>
                    <span class="operator">+</span>
                    9
                    <span class="flex-row items-center">
                        <span class="math-serif mr-1">Γ</span>
                        (
                        <span class="flex-col items-center mx-1">
                            <span class="text-07 px-1">3</span>
                            <span class="fraction-line w-full" style="height: 1px; background: currentColor;"></span>
                            <span class="text-07 px-1">4</span>
                        </span>
                        )
                        <sup class="text-07" style="transform: translateY(-0.6em);">2</sup>
                    </span>
                </span>
                <span class="den flex-row items-center gap-2 px-4">
                    8
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand">π</span>
                    </span>
                    <span class="operator">&minus;</span>
                    9
                    <span class="flex-row items-center">
                        <span class="math-serif mr-1">Γ</span>
                        (
                        <span class="flex-col items-center mx-1">
                            <span class="text-07 px-1">3</span>
                            <span class="fraction-line w-full" style="height: 1px; background: currentColor;"></span>
                            <span class="text-07 px-1">4</span>
                        </span>
                        )
                        <sup class="text-07" style="transform: translateY(-0.6em);">2</sup>
                    </span>
                </span>
            </span>
        </div>
    `,
   "2|(4n-1)(4n+1)": `
        <div class="math-row flex-row items-center gap-8">
            <span class="fraction-line-wrapper">
                <span class="num flex-row items-center gap-2 px-4">
                    2
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand"><i class="math-serif">π</i></span>
                    </span>
                    <span class="operator">+</span>
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand">2</span>
                    </span>
                    
                    <span class="flex-row items-center gap-1">
                        <span class="math-serif">&Gamma;</span>
                        <span class="inline-flex-row">
                            <span class="paren-group flex-row items-center">
                                <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                                    <path d="M 9,1 C 0,10 0,30 9,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                                </svg>
                                <span class="paren-content">
                                    <div class="fraction-line-wrapper text-sm">
                                        <span class="num inner-num">3</span>
                                        <span class="den pt-1">4</span>
                                    </div>
                                </span>
                                <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                                    <path d="M 1,1 C 10,10 10,30 1,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                                </svg>
                            </span>
                            <sup class="sup-adjust">2</sup>
                        </span>
                    </span>
                    
                </span>
                <span class="den flex-row items-center gap-2 px-4">
                    2
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand"><i class="math-serif">π</i></span>
                    </span>
                    <span class="operator">&minus;</span>
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand">2</span>
                    </span>
                    
                    <span class="flex-row items-center gap-1">
                        <span class="math-serif">&Gamma;</span>
                        <span class="inline-flex-row">
                            <span class="paren-group flex-row items-center">
                                <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                                    <path d="M 9,1 C 0,10 0,30 9,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                                </svg>
                                <span class="paren-content">
                                    <div class="fraction-line-wrapper text-sm">
                                        <span class="num inner-num">3</span>
                                        <span class="den pt-1">4</span>
                                    </div>
                                </span>
                                <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                                    <path d="M 1,1 C 10,10 10,30 1,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                                </svg>
                            </span>
                            <sup class="sup-adjust">2</sup>
                        </span>
                    </span>
                    
                </span>
            </span>
        </div>
    `,
    "2|2n(2n-1)": `
        <div class="math-row flex-row items-center gap-8">
            <span class="fraction-line-wrapper">
                <span class="num flex-row items-center justify-center gap-2 px-4">
                    2
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand"><i class="math-serif">π</i></span>
                    </span>
                </span>
                <span class="den flex-row items-center gap-2 px-4">
                    2
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand"><i class="math-serif">π</i></span>
                    </span>
                    <span class="operator">&minus;</span>
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand">2</span>
                    </span>
                    
                    <span class="flex-row items-center gap-1">
                        <span class="math-serif">&Gamma;</span>
                        <span class="inline-flex-row">
                            <span class="paren-group flex-row items-center">
                                <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                                    <path d="M 9,1 C 0,10 0,30 9,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                                </svg>
                                <span class="paren-content">
                                    <div class="fraction-line-wrapper text-sm">
                                        <span class="num inner-num">3</span>
                                        <span class="den pt-1">4</span>
                                    </div>
                                </span>
                                <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                                    <path d="M 1,1 C 10,10 10,30 1,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                                </svg>
                            </span>
                            <sup class="sup-adjust">2</sup>
                        </span>
                    </span>
                    
                </span>
            </span>
        </div>
    `,
    "2n-1|n^2+4": `
        <div class="math-row flex-row items-center">
            <span class="fraction-line-wrapper">
                <span class="num px-4" style="display: grid; place-items: center;">
                    <span style="grid-area: 1 / 1;">4</span>
                    <span style="grid-area: 1 / 1; visibility: hidden; pointer-events: none;" class="flex-row items-center gap-2">
                        <span class="flex-row items-center">
                            <i class="math-serif">e</i><sup class="sup-adjust" style="transform: translateY(-0.6em);"><i class="math-serif">π</i></sup>
                        </span>
                        <span class="operator">&minus;</span>
                        <span>1</span>
                    </span>
                </span>
                <span class="den flex-row items-center gap-2 px-4">
                    <span class="flex-row items-center">
                        <i class="math-serif">e</i><sup class="sup-adjust" style="transform: translateY(-0.4em);"><i class="math-serif">π</i></sup>
                    </span>
                    <span class="operator">&minus;</span>
                    <span>1</span>
                </span>
            </span>
            <span class="operator mx-2">+</span>
            <span>2</span>
        </div>
    `,
    "16n|(2n+1)^4": `
        <div class="math-row flex-row items-center gap-8">
            <span class="fraction-line-wrapper">
                <span class="num flex-row items-center justify-center gap-2 px-4">
                    <span class="flex-row items-center gap-1">
                        <span class="math-serif">&Gamma;</span>
                        <span class="inline-flex-row">
                            <span class="paren-group flex-row items-center">
                                <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                                    <path d="M 9,1 C 0,10 0,30 9,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                                </svg>
                                <span class="paren-content">
                                    <div class="fraction-line-wrapper text-sm">
                                        <span class="num inner-num">1</span>
                                        <span class="den pt-1">4</span>
                                    </div>
                                </span>
                                <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                                    <path d="M 1,1 C 10,10 10,30 1,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                                </svg>
                            </span>
                            <sup class="sup-adjust">8</sup>
                        </span>
                    </span>
                    
                    <span class="operator">&minus;</span>
                    
                    <span class="flex-row items-center gap-1">
                        <span>64</span>
                        <span class="flex-row items-center">
                            <i class="math-serif">π</i><sup class="sup-adjust" style="transform: translateY(-0.4em);">4</sup>
                        </span>
                    </span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-2 px-4">
                    <span class="flex-row items-center gap-1">
                        <span>320</span>
                        <span class="flex-row items-center">
                            <i class="math-serif">π</i><sup class="sup-adjust" style="transform: translateY(-0.4em);">4</sup>
                        </span>
                    </span>
                    
                    <span class="operator">&minus;</span>
                    
                    <span class="flex-row items-center gap-1">
                        <span class="math-serif">&Gamma;</span>
                        <span class="inline-flex-row">
                            <span class="paren-group flex-row items-center">
                                <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                                    <path d="M 9,1 C 0,10 0,30 9,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                                </svg>
                                <span class="paren-content">
                                    <div class="fraction-line-wrapper text-sm">
                                        <span class="num inner-num">1</span>
                                        <span class="den pt-1">4</span>
                                    </div>
                                </span>
                                <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                                    <path d="M 1,1 C 10,10 10,30 1,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                                </svg>
                            </span>
                            <sup class="sup-adjust">8</sup>
                        </span>
                    </span>
                </span>
            </span>
        </div>
    `,
    "3|3n(3n+2)": `
        <div class="math-row flex-row items-center gap-8">
            <span class="fraction-line-wrapper">
                
                <span class="num flex-row items-center justify-center gap-2 px-4">
                    <span>8</span>
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand">3</span>
                    </span>
                    <i class="math-serif">π</i>
                </span>
                
                <span class="den flex-row items-center justify-center gap-2 px-4">
                    
                    <span class="flex-row items-center gap-1">
                        <span class="flex-row items-center">
                            <sup class="text-07" style="transform: translateY(-0.5em); z-index: 1;">3</sup>
                            <span class="sqrt-wrapper">
                                <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                    <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                                </svg>
                                <span class="radicand">4</span>
                            </span>
                        </span>
                        
                        <span class="math-serif">&Gamma;</span>
                        <span class="inline-flex-row">
                            <span class="paren-group flex-row items-center">
                                <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                                    <path d="M 9,1 C 0,10 0,30 9,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                                </svg>
                                <span class="paren-content">
                                    <div class="fraction-line-wrapper text-sm">
                                        <span class="num inner-num">1</span>
                                        <span class="den pt-1">3</span>
                                    </div>
                                </span>
                                <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                                    <path d="M 1,1 C 10,10 10,30 1,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                                </svg>
                            </span>
                            <sup class="sup-adjust">3</sup>
                        </span>
                    </span>
                    
                    <span class="operator">&minus;</span>
                    
                    <span class="flex-row items-center gap-1">
                        <span>4</span>
                        <span class="sqrt-wrapper">
                            <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                            </svg>
                            <span class="radicand">3</span>
                        </span>
                        <i class="math-serif">π</i>
                    </span>
                    
                </span>
            </span>
        </div>
    `,
    "1|(3n)^2-1": `
        <div class="math-row flex-row items-center">
            <span class="fraction-line-wrapper">
                
                <span class="num px-4" style="display: grid; place-items: center;">
                    <span style="grid-area: 1 / 1;" class="flex-row items-center gap-2">
                        <span>4</span>
                        <span class="flex-row items-center gap-1">
                            <span class="math-serif">&Gamma;</span>
                            <span class="inline-flex-row">
                                <span class="paren-group flex-row items-center">
                                    <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                                        <path d="M 9,1 C 0,10 0,30 9,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                                    </svg>
                                    <span class="paren-content">
                                        <div class="fraction-line-wrapper text-sm">
                                            <span class="num inner-num">1</span>
                                            <span class="den pt-1">3</span>
                                        </div>
                                    </span>
                                    <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                                        <path d="M 1,1 C 10,10 10,30 1,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                                    </svg>
                                </span>
                            </span>
                        </span>
                    </span>
                    
                    <span style="grid-area: 1 / 1; visibility: hidden; pointer-events: none;" class="flex-row items-center gap-2">
                        <span class="flex-row items-center gap-1">
                            <span>2</span>
                            <span class="math-serif">&Gamma;</span>
                            <span class="inline-flex-row">
                                <span class="paren-group flex-row items-center">
                                    <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                                        <path d="M 9,1 C 0,10 0,30 9,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                                    </svg>
                                    <span class="paren-content">
                                        <div class="fraction-line-wrapper text-sm">
                                            <span class="num inner-num">1</span>
                                            <span class="den pt-1">3</span>
                                        </div>
                                    </span>
                                    <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                                        <path d="M 1,1 C 10,10 10,30 1,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                                    </svg>
                                </span>
                            </span>
                        </span>
                        
                        <span class="operator">&minus;</span>
                        
                        <span class="flex-row items-center gap-1">
                            <span class="flex-row items-center">
                                <sup class="text-07" style="margin-right: -0.5em; transform: translateY(-0.5em); z-index: 1;">3</sup>
                                <span class="sqrt-wrapper">
                                    <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                        <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                                    </svg>
                                    <span class="radicand">2</span>
                                </span>
                            </span>
                            
                            <span class="math-serif">&Gamma;</span>
                            <span class="inline-flex-row">
                                <span class="paren-group flex-row items-center">
                                    <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                                        <path d="M 9,1 C 0,10 0,30 9,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                                    </svg>
                                    <span class="paren-content">
                                        <div class="fraction-line-wrapper text-sm">
                                            <span class="num inner-num">2</span>
                                            <span class="den pt-1">3</span>
                                        </div>
                                    </span>
                                    <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                                        <path d="M 1,1 C 10,10 10,30 1,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                                    </svg>
                                </span>
                                <sup class="sup-adjust" style="transform: translateY(-0.6em);">2</sup>
                            </span>
                        </span>
                    </span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-2 px-4">
                    <span class="flex-row items-center gap-1">
                        <span>2</span>
                        <span class="math-serif">&Gamma;</span>
                        <span class="inline-flex-row">
                            <span class="paren-group flex-row items-center">
                                <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                                    <path d="M 9,1 C 0,10 0,30 9,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                                </svg>
                                <span class="paren-content">
                                    <div class="fraction-line-wrapper text-sm">
                                        <span class="num inner-num">1</span>
                                        <span class="den pt-1">3</span>
                                    </div>
                                </span>
                                <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                                    <path d="M 1,1 C 10,10 10,30 1,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                                </svg>
                            </span>
                        </span>
                    </span>
                    
                    <span class="operator">&minus;</span>
                    
                    <span class="flex-row items-center gap-1">
                        <span class="flex-row items-center">
                            <sup class="text-07" style="margin-right: -0.2em; transform: translateY(-0.5em); z-index: 1;">3</sup>
                            <span class="sqrt-wrapper">
                                <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                    <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                                </svg>
                                <span class="radicand">2</span>
                            </span>
                        </span>
                        
                        <span class="math-serif">&Gamma;</span>
                        <span class="inline-flex-row">
                            <span class="paren-group flex-row items-center">
                                <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                                    <path d="M 9,1 C 0,10 0,30 9,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                                </svg>
                                <span class="paren-content">
                                    <div class="fraction-line-wrapper text-sm">
                                        <span class="num inner-num">2</span>
                                        <span class="den pt-1">3</span>
                                    </div>
                                </span>
                                <svg class="paren-svg" viewBox="0 0 10 40" preserveAspectRatio="none">
                                    <path d="M 1,1 C 10,10 10,30 1,39" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" vector-effect="non-scaling-stroke"/>
                                </svg>
                            </span>
                            <sup class="sup-adjust">2</sup>
                        </span>
                    </span>
                </span>
                
            </span>
            
            <span class="operator mx-2">&minus;</span>
            <span>1</span>
        </div>
    `,
    "n|2n": `
        <div class="math-row flex-row items-center gap-8">
            <span class="fraction-line-wrapper">
                <span class="num flex-row items-center justify-center gap-2 px-4">
                    <span>4</span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-2 px-4">
                    <span class="flex-row items-center">
                        <i class="math-serif">e</i><sup class="sup-adjust" style="transform: translateY(-0.4em);">2</sup>
                    </span>
                    <span class="operator">&minus;</span>
                    <span>5</span>
                </span>
            </span>
        </div>
    `,
    "2|2n": `
        <div class="math-row flex-row items-center gap-8">
            <span class="fraction-line-wrapper">
                
                <span class="num flex-row items-center justify-center gap-2 px-4">
                    <span>2</span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-2 px-4">
                    <i class="math-serif">e</i>
                    
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand"><i class="math-serif">π</i></span>
                    </span>
                    
                    <span>erfc(1)</span>
                </span>
                
            </span>
        </div>
    `,
    "1+1/n|-1/(1+n)": `
        <div class="math-row flex-row items-center gap-8">
            <span class="fraction-line-wrapper">
                
                <span class="num flex-row items-center justify-center gap-2 px-4">
                    <i class="math-serif">e</i>
                </span>
                
                <span class="den flex-row items-center justify-center gap-2 px-4">
                    <i class="math-serif">e</i>
                    <span class="operator">&minus;</span>
                    <span>1</span>
                </span>
                
            </span>
        </div>
    `,
    "2n-1|n^2+1": `
        <div class="math-row flex-row items-center">
            <span class="fraction-line-wrapper">
                <span class="num px-4" style="display: grid; place-items: center;">
                    <span style="grid-area: 1 / 1;">2</span>
                    <span style="grid-area: 1 / 1; visibility: hidden; pointer-events: none;" class="flex-row items-center gap-2">
                        <span class="flex-row items-center">
                            <i class="math-serif">e</i>
                            <sup class="sup-adjust" style="transform: translateY(-0.8em); margin-left: 0.1em;">
                                <div class="fraction-line-wrapper text-sm" style="font-size: 0.75em;">
                                    <span class="num inner-num"><i class="math-serif">π</i></span>
                                    <span class="den pt-1">2</span>
                                </div>
                            </sup>
                        </span>
                        <span class="operator">&minus;</span>
                        <span>1</span>
                    </span>
                </span>
                <span class="den flex-row items-center gap-2 px-4">
                    <span class="flex-row items-center">
                        <i class="math-serif">e</i>
                        <sup class="sup-adjust" style="margin-left: 0.1em;">
                            <div class="fraction-line-wrapper text-sm" style="font-size: 0.75em; margin-bottom: 35px;">
                                <span class="num inner-num"><i class="math-serif">π</i></span>
                                <span class="den pt-1">2</span>
                            </div>
                        </sup>
                    </span>
                    <span class="operator">&minus;</span>
                    <span>1</span>
                </span>
            </span>
            <span class="operator mx-2">+</span>
            <span>1</span>
        </div>
    `,
    "2n(2n(6n+1)+5)-1|-4n(2n+1)^5": `
        <div class="math-row flex-row items-center">
            <span class="fraction-line-wrapper">
                
                <span class="num px-4" style="display: grid; place-items: center;">
                    <span style="grid-area: 1 / 1;">8</span>
                    
                    <span style="grid-area: 1 / 1; visibility: hidden; pointer-events: none;" class="flex-row items-center gap-2">
                        <span class="flex-row items-center gap-1">
                            <span>4</span>
                            <span class="sqrt-wrapper">
                                <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                    <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                                </svg>
                                <span class="radicand">2</span>
                            </span>
                            <i class="math-serif">G</i>
                        </span>
                        
                        <span class="operator">&minus;</span>
                        <span>8</span>
                        <span class="operator">+</span>
                        
                        <span class="flex-row items-center gap-1">
                            <span class="sqrt-wrapper">
                                <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                    <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                                </svg>
                                <span class="radicand">2</span>
                            </span>
                            <i class="math-serif">π</i>
                            <span>ln(2)</span>
                        </span>
                    </span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-2 px-4">
                    <span class="flex-row items-center gap-1">
                        <span>4</span>
                        <span class="sqrt-wrapper">
                            <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                            </svg>
                            <span class="radicand">2</span>
                        </span>
                        <i class="math-serif">G</i>
                    </span>
                    
                    <span class="operator">&minus;</span>
                    <span>8</span>
                    <span class="operator">+</span>
                    
                    <span class="flex-row items-center gap-1">
                        <span class="sqrt-wrapper">
                            <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                            </svg>
                            <span class="radicand">2</span>
                        </span>
                        <i class="math-serif">π</i>
                        <span>ln(2)</span>
                    </span>
                </span>
                
            </span>
            
            <span class="operator mx-2">+</span>
            <span>1</span>
        </div>
    `,
    "5|(3n)^2": `
        <div class="math-row flex-row items-center gap-8">
            <span class="fraction-line-wrapper">
                
                <span class="num flex-row items-center justify-center gap-2 px-4">
                    <span>9</span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-2 px-4">
                    <span>9</span>
                    
                    <span class="operator">&minus;</span>
                    
                    <span class="flex-row items-center gap-1">
                        <span class="sqrt-wrapper">
                            <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                            </svg>
                            <span class="radicand">3</span>
                        </span>
                        <i class="math-serif">π</i>
                    </span>
                    
                    <span class="operator">&minus;</span>
                    
                    <span class="flex-row items-center gap-1">
                        <span>3</span>
                        <span>ln(2)</span>
                    </span>
                </span>
                
            </span>
        </div>
    `,
    "9n-4|-6n(3n-1)": `
        <div class="math-row flex-row items-center gap-8">
            <span class="fraction-line-wrapper">
                
                <span class="num flex-row items-center justify-center gap-2 px-4">
                    <span>1</span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-2 px-4">
                    <span class="flex-row items-center">
                        <sup class="text-07" style="margin-right: -0.2em; transform: translateY(-0.5em); z-index: 1;">3</sup>
                        <span class="sqrt-wrapper">
                            <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                            </svg>
                            <span class="radicand">2</span>
                        </span>
                    </span>
                    
                    <span class="operator">&minus;</span>
                    <span>1</span>
                </span>
                
            </span>
        </div>
    `,
    "8n-2|(12n-1)(4n+1)": `
        <div class="math-row flex-row items-center">
            <span class="fraction-line-wrapper">
                
                <span class="num px-4" style="display: grid; place-items: center;">
                    <span style="grid-area: 1 / 1;">2</span>
                    
                    <span style="grid-area: 1 / 1; visibility: hidden; pointer-events: none;" class="flex-row items-center gap-2">
                        <span class="flex-row items-center">
                            <sup class="text-07" style="margin-right: -0.2em; transform: translateY(-0.5em); z-index: 1;">3</sup>
                            <span class="sqrt-wrapper">
                                <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                    <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                                </svg>
                                <span class="radicand">2</span>
                            </span>
                        </span>
                        
                        <span class="operator">&minus;</span>
                        <span>1</span>
                    </span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-2 px-4">
                    <span class="flex-row items-center">
                        <sup class="text-07" style="margin-right: -0.5em; transform: translateY(-0.5em); z-index: 1;">3</sup>
                        <span class="sqrt-wrapper">
                            <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                            </svg>
                            <span class="radicand">2</span>
                        </span>
                    </span>
                    
                    <span class="operator">&minus;</span>
                    <span>1</span>
                </span>
                
            </span>
            
            <span class="operator mx-2">+</span>
            <span>1</span>
        </div>
    `,
    "10n-8|-(4n-3)(4n-1)": `
        <div class="math-row flex-row items-center gap-8">
            <span class="fraction-line-wrapper">
                
                <span class="num flex-row items-center justify-center gap-2 px-4">
                    <span class="flex-row items-center">
                        <sup class="text-07" style="margin-right: -0.2em; transform: translateY(-0.5em); z-index: 1;">3</sup>
                        <span class="sqrt-wrapper">
                            <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                            </svg>
                            <span class="radicand">2</span>
                        </span>
                    </span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-2 px-4">
                    <span>2</span>
                    <span class="operator">&minus;</span>
                    
                    <span class="flex-row items-center">
                        <sup class="text-07" style="margin-right: -0.2em; transform: translateY(-0.5em); z-index: 1;">3</sup>
                        <span class="sqrt-wrapper">
                            <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                            </svg>
                            <span class="radicand">2</span>
                        </span>
                    </span>
                </span>
                
            </span>
        </div>
    `,
    "30n-20|5-12n(12n+4)": `
        <div class="math-row flex-row items-center gap-2 px-4">
            
            <span class="flex-row items-center">
                <sup class="text-07" style="margin-right: -0.4em; transform: translateY(-0.5em); z-index: 1;">3</sup>
                <span class="sqrt-wrapper">
                    <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                        <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                    </svg>
                    <span class="radicand">4</span>
                </span>
            </span>
            
            <span class="operator">+</span>
            
            <span class="flex-row items-center gap-1">
                <span>2</span>
                <span class="flex-row items-center">
                    <sup class="text-07" style="margin-right: -0.4em; transform: translateY(-0.5em); z-index: 1;">3</sup>
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand">2</span>
                    </span>
                </span>
            </span>
            
            <span class="operator">&minus;</span>
            <span>1</span>
            
        </div>
    `,
    "72n-36|((6n)^2-1)^2": `
        <div class="math-row flex-row items-center gap-8">
            <span class="fraction-line-wrapper">
                
                <span class="num flex-row items-center justify-center gap-2 px-4">
                    <i class="math-serif">π</i>
                    <span class="operator">+</span>
                    <span>3</span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-2 px-4">
                    <i class="math-serif">π</i>
                    <span class="operator">&minus;</span>
                    <span>3</span>
                </span>
                
            </span>
        </div>
    `,
    "3n-2|n(1-2n)": `
        <div class="math-row flex-row items-center gap-8">
            <span class="fraction-line-wrapper">
                
                <span class="num flex-row items-center justify-center gap-2 px-4">
                    <span>2</span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-2 px-4">
                    <i class="math-serif">π</i>
                </span>
                
            </span>
        </div>
    `,
    "6n-5|n^2(3n-2)^2": `
        <div class="math-row flex-row items-center gap-8">
            <span class="fraction-line-wrapper">
                
                <span class="num flex-row items-center justify-center gap-2 px-4">
                    <span class="flex-row items-center gap-1">
                        <span>2</span>
                        <span class="sqrt-wrapper">
                            <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                            </svg>
                            <span class="radicand">3</span>
                        </span>
                    </span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-2 px-4">
                    <i class="math-serif">π</i>
                </span>
                
            </span>
        </div>
    `,
    "18n-9|(3n-1)^2(3n+1)^2": `
        <div class="math-row flex-row items-center">
            <span class="fraction-line-wrapper">
                
                <span class="num px-4" style="display: grid; place-items: center;">
                    <span style="grid-area: 1 / 1;">18</span>
                    
                    <span style="grid-area: 1 / 1; visibility: hidden; pointer-events: none;" class="flex-row items-center gap-2">
                        <span class="flex-row items-center gap-1">
                            <span>2</span>
                            <span class="sqrt-wrapper">
                                <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                    <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                                </svg>
                                <span class="radicand">3</span>
                            </span>
                            <i class="math-serif">π</i>
                        </span>
                        
                        <span class="operator">&minus;</span>
                        <span>9</span>
                    </span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-2 px-4">
                    <span class="flex-row items-center gap-1">
                        <span>2</span>
                        <span class="sqrt-wrapper">
                            <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                            </svg>
                            <span class="radicand">3</span>
                        </span>
                        <i class="math-serif">π</i>
                    </span>
                    
                    <span class="operator">&minus;</span>
                    <span>9</span>
                </span>
                
            </span>
            
            <span class="operator mx-2">+</span>
            <span>1</span>
        </div>
    `,
    "7n-5|-n(12n-6)": `
        <div class="math-row flex-row items-center gap-8">
            <span class="fraction-line-wrapper">
                
                <span class="num flex-row items-center justify-center gap-2 px-4">
                    <span class="flex-row items-center gap-1">
                        <span>3</span>
                        <span class="sqrt-wrapper">
                            <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                            </svg>
                            <span class="radicand">3</span>
                        </span>
                    </span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-2 px-4">
                    <span class="flex-row items-center gap-1">
                        <span>2</span>
                        <i class="math-serif">π</i>
                    </span>
                </span>
                
            </span>
        </div>
    `,
    "4n|3(2n-1)^2": `
        <div class="math-row flex-row items-center">
            <span class="fraction-line-wrapper">
                
                <span class="num flex-row items-center justify-center gap-2 px-4">
                    <span class="flex-row items-center gap-1">
                        <span>6</span>
                        <span class="sqrt-wrapper">
                            <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                            </svg>
                            <span class="radicand">3</span>
                        </span>
                    </span>
                </span>
                
                <span class="den px-4" style="display: grid; place-items: center;">
                    <span style="grid-area: 1 / 1;">
                        <i class="math-serif">π</i>
                    </span>
                    
                    <span style="grid-area: 1 / 1; visibility: hidden; pointer-events: none;" class="flex-row items-center gap-1">
                        <span>6</span>
                        <span class="sqrt-wrapper">
                            <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                            </svg>
                            <span class="radicand">3</span>
                        </span>
                    </span>
                </span>
                
            </span>
            
            <span class="operator mx-2">+</span>
            <span>1</span>
        </div>
    `,
    "5n-3|-2n(2n-1)": `
        <div class="math-row flex-row items-center gap-8">
            <span class="fraction-line-wrapper">
                
                <span class="num flex-row items-center justify-center gap-2 px-4">
                    <span class="flex-row items-center gap-1">
                        <span>3</span>
                        <span class="sqrt-wrapper">
                            <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                            </svg>
                            <span class="radicand">3</span>
                        </span>
                    </span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-2 px-4">
                    <i class="math-serif">π</i>
                </span>
                
            </span>
        </div>
    `,
    "32n-16|(4n-1)^2(4n+1)^2": `
        <div class="math-row flex-row items-center">
            <span class="fraction-line-wrapper">
                
                <span class="num px-4" style="display: grid; place-items: center;">
                    <span style="grid-area: 1 / 1;">8</span>
                    
                    <span style="grid-area: 1 / 1; visibility: hidden; pointer-events: none;" class="flex-row items-center gap-2">
                        <span class="flex-row items-center gap-1">
                            <span class="sqrt-wrapper">
                                <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                    <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                                </svg>
                                <span class="radicand">2</span>
                            </span>
                            <i class="math-serif">π</i>
                        </span>
                        <span class="operator">&minus;</span>
                        <span>4</span>
                    </span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-2 px-4">
                    <span class="flex-row items-center gap-1">
                        <span class="sqrt-wrapper">
                            <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                            </svg>
                            <span class="radicand">2</span>
                        </span>
                        <i class="math-serif">π</i>
                    </span>
                    <span class="operator">&minus;</span>
                    <span>4</span>
                </span>
                
            </span>
            
            <span class="operator mx-2">+</span>
            <span>1</span>
        </div>
    `,
    "32n(n-1)+15|-((4n)^2)(4n-1)(4n+1)": `
        <div class="math-row flex-row items-center gap-8">
            <span class="fraction-line-wrapper">
                
                <span class="num flex-row items-center justify-center gap-2 px-4">
                    <span>4</span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-2 px-4">
                    <span class="flex-row items-center gap-1">
                        <span class="sqrt-wrapper">
                            <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                            </svg>
                            <span class="radicand">2</span>
                        </span>
                        <i class="math-serif">π</i>
                    </span>
                    <span class="operator">&minus;</span>
                    <span>4</span>
                </span>
                
            </span>
        </div>
    `,
    "4n(5n+1)+1|-8n(2n+1)^3": `
        <div class="math-row flex-row items-center gap-8">
            <span class="fraction-line-wrapper">
                
                <span class="num flex-row items-center justify-center gap-2 px-4">
                    <i class="math-serif">π</i>
                </span>
                
                <span class="den flex-row items-center justify-center gap-2 px-4">
                    <i class="math-serif">π</i>
                    <span class="operator">&minus;</span>
                    <span>3</span>
                </span>
                
            </span>
        </div>
    `,
    "8n-4|n^2(4n-1)(4n+1)": `
        <div class="math-row flex-row items-center gap-8">
            <span class="fraction-line-wrapper">
                
                <span class="num flex-row items-center justify-center gap-2 px-4">
                    <span>2</span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-2 px-4">
                    <span>8</span>
                    <span class="operator">&minus;</span>
                    <span class="flex-row items-center gap-1">
                        <span>(</span>
                        <span>1</span>
                        <span class="operator">+</span>
                        <span class="sqrt-wrapper">
                            <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                            </svg>
                            <span class="radicand">2</span>
                        </span>
                        <span>)</span>
                        <i class="math-serif">π</i>
                    </span>
                </span>
                
            </span>
        </div>
    `,
    "8n-4|n^2(4n-3)(4n+3)": `
        <div class="math-row flex-row items-center gap-8">
            <span class="fraction-line-wrapper">
                
                <span class="num flex-row items-center justify-center gap-2 px-4">
                    <span>18</span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-2 px-4">
                    <span>8</span>
                    <span class="operator">+</span>
                    <span class="flex-row items-center gap-1">
                        <span>3</span>
                        <i class="math-serif">π</i>
                    </span>
                    <span class="operator">&minus;</span>
                    <span class="flex-row items-center gap-1">
                        <span>3</span>
                        <span class="sqrt-wrapper">
                            <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                            </svg>
                            <span class="radicand">2</span>
                        </span>
                        <i class="math-serif">π</i>
                    </span>
                </span>
                
            </span>
        </div>
    `,
    "96n^2+6|(2n+1)^2(4n+1)^2(4n+3)^2": `
        <div class="math-row flex-row items-center gap-8">
            <span class="fraction-line-wrapper">
                
                <span class="num flex-row items-center justify-center px-4">
                    <span class="flex-row items-center gap-1">
                        <span>9</span>
                        <i class="math-serif">π</i>
                    </span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-2 px-4">
                    <span>4</span>
                    <span class="operator">+</span>
                    <span class="flex-row items-center gap-1">
                        <span>4</span>
                        <span class="sqrt-wrapper">
                            <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                            </svg>
                            <span class="radicand">2</span>
                        </span>
                    </span>
                    <span class="operator">&minus;</span>
                    <span class="flex-row items-center gap-1">
                        <span>3</span>
                        <i class="math-serif">π</i>
                    </span>
                </span>
                
            </span>
        </div>
    `,
    "n(4n-3)+1|-2n^3(2n+1)": `
        <div class="math-row flex-row items-center gap-8">
            <span class="fraction-line-wrapper">
                
                <span class="num flex-row items-center justify-center px-4">
                    <span>1</span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-1 px-4">
                    <span>2</span>
                    <span class="math-serif">ln</span>
                    <span>(2)</span>
                </span>
                
            </span>
        </div>
    `,
    "(2n-1)^2+2|-(n^2)(2n-1)(2n+1)": `
        <div class="math-row flex-row items-center gap-8">
            <span class="fraction-line-wrapper">
                
                <span class="num flex-row items-center justify-center px-4">
                    <span>1</span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-2 px-4">
                    <span class="flex-row items-center gap-1">
                        <span>2</span>
                        <span class="math-serif">ln</span>
                        <span>(2)</span>
                    </span>
                    <span class="operator">&minus;</span>
                    <span>1</span>
                </span>
                
            </span>
        </div>
    `,
    "n(3n-1)|n^3(-2n-2)": `
        <div class="math-row flex-row items-center gap-8">
            <span class="fraction-line-wrapper">
                
                <span class="num flex-row items-center justify-center px-4">
                    <span>1</span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-1 px-4">
                    <span class="math-serif">ln</span>
                    <span>(2)</span>
                </span>
                
            </span>
        </div>
    `,
    "3n^2-1|n^3(-2n-4)": `
        <div class="math-row flex-row items-center">
            <span class="fraction-line-wrapper">
                
                <span class="num px-4" style="display: grid; place-items: center;">
                    <span style="grid-area: 1 / 1;">2</span>
                    
                    <span style="grid-area: 1 / 1; visibility: hidden; pointer-events: none;" class="flex-row items-center gap-1">
                        <span class="math-serif">ln</span>
                        <span>(2)</span>
                    </span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-1 px-4">
                    <span class="math-serif">ln</span>
                    <span>(2)</span>
                </span>
                
            </span>
            
            <span class="operator mx-2">&minus;</span>
            <span>1</span>
        </div>
    `,
    "7n+1|72n(2n-1)": `
        <div class="math-row flex-row items-center gap-8">
            <span class="fraction-line-wrapper">
                
                <span class="num flex-row items-center justify-center px-4">
                    <span>15</span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-1 px-4">
                    <span>2</span>
                    <span class="math-serif">ln</span>
                    <span>(2)</span>
                </span>
                
            </span>
        </div>
    `,
    "17(2n-1)|-((15n)^2)": `
        <div class="math-row flex-row items-center gap-8">
            <span class="fraction-line-wrapper">
                
                <span class="num flex-row items-center justify-center px-4">
                    <span>15</span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-1 px-4">
                    <span>2</span>
                    <span class="math-serif">ln</span>
                    <span>(2)</span>
                </span>
                
            </span>
        </div>
    `,
    "10n(n+1)+3|-((n+1)^2)(4n+3)(4n+5)": `
        <div class="math-row flex-row items-center gap-8">
            <span class="fraction-line-wrapper">
                
                <span class="num flex-row items-center justify-center px-4">
                    <span class="flex-row items-center gap-1">
                        <span>10</span>
                        <span class="math-serif">ln</span>
                        <span>(2)</span>
                    </span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-2 px-4">
                    <span class="flex-row items-center gap-1">
                        <span>2</span>
                        <span class="math-serif">ln</span>
                        <span>(2)</span>
                    </span>
                    <span class="operator">&minus;</span>
                    <span>1</span>
                </span>
                
            </span>
        </div>
    `,
    "7n-3|4n(2n-1)": `
        <div class="math-row flex-row items-center gap-8">
            <span class="fraction-line-wrapper">
                
                <span class="num flex-row items-center justify-center px-4">
                    <span>3</span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-1 px-4">
                    <span class="math-serif">ln</span>
                    <span>(2)</span>
                </span>
                
            </span>
        </div>
    `,
    "32(n-1)|(4n-3)^2(4n-1)^2": `
        <div class="math-row flex-row items-center">
            <span class="fraction-line-wrapper">
                
                <span class="num px-4" style="display: grid; place-items: center;">
                    <span style="grid-area: 1 / 1;" class="flex-row items-center gap-1">
                        <span>2</span>
                        <span class="sqrt-wrapper">
                            <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                            </svg>
                            <span class="radicand">2</span>
                        </span>
                    </span>
                    
                    <span style="grid-area: 1 / 1; visibility: hidden; pointer-events: none;" class="flex-row items-center gap-1">
                        <span class="math-serif">log</span>
                        <span>(</span>
                        <span>1</span>
                        <span class="operator">+</span>
                        <span class="sqrt-wrapper">
                            <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                            </svg>
                            <span class="radicand">2</span>
                        </span>
                        <span>)</span>
                    </span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-1 px-4">
                    <span class="math-serif">log</span>
                    <span>(</span>
                    <span>1</span>
                    <span class="operator">+</span>
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand">2</span>
                    </span>
                    <span>)</span>
                </span>
                
            </span>
            
            <span class="operator mx-2">&minus;</span>
            <span>3</span>
        </div>
    `,
    "n|2n-1": `
        <div class="math-row flex-row items-center gap-8">
            <span class="fraction-line-wrapper">
                
                <span class="num flex-row items-center justify-center px-4">
                    <span class="flex-row items-center gap-1">
                        <span>3</span>
                        <span><i class="math-serif">I</i><sub>1</sub>(1)</span>
                    </span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-2 px-4">
                    <span class="flex-row items-center gap-1">
                        <span>5</span>
                        <span><i class="math-serif">I</i><sub>0</sub>(1)</span>
                    </span>
                    <span class="operator">&minus;</span>
                    <span class="flex-row items-center gap-1">
                        <span>9</span>
                        <span><i class="math-serif">I</i><sub>1</sub>(1)</span>
                    </span>
                </span>
                
            </span>
        </div>
    `,
    "1|2n-1": `
        <div class="math-row flex-row items-center">
            <span class="fraction-line-wrapper">
                
                <span class="num flex-row items-center justify-center px-4">
                    <span><i class="math-serif">K</i><sub>3/4</sub>(1/8)</span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-1 px-4">
                    <span>2</span>
                    <span><i class="math-serif">K</i><sub>1/4</sub>(1/8)</span>
                </span>
                
            </span>
            
            <span class="operator mx-2">+</span>
            
            <span class="fraction-line-wrapper">
                <span class="num flex-row items-center justify-center px-3">
                    <span>1</span>
                </span>
                <span class="den flex-row items-center justify-center px-3">
                    <span>2</span>
                </span>
            </span>
        </div>
    `,
   "n|n^2": `
        <div class="math-row flex-row items-center gap-8">
            <span class="fraction-line-wrapper">
                
                <span class="num flex-row items-center justify-center px-4">
                    <span>1</span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-2 px-4">
                    <span>
                        <i class="math-serif">φ</i><sup><span style="display: inline-flex; align-items: center;">1/<span class="sqrt-wrapper"><svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none"><path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/></svg><span class="radicand">5</span></span></span></sup>
                    </span>
                    
                    <span>
                        <i class="math-serif">B</i><sub><span style="display: inline-flex; align-items: center;">1/2 &minus; 1/(2<span class="sqrt-wrapper"><svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none"><path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/></svg><span class="radicand">5</span></span>)</span></sub><span style="display: inline-flex; align-items: center;">(1/2 + 1/(2<span class="sqrt-wrapper"><svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none"><path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/></svg><span class="radicand">5</span></span>), 1/2 &minus; 1/(2<span class="sqrt-wrapper"><svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none"><path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/></svg><span class="radicand">5</span></span>))</span>
                    </span>
                </span>
                
            </span>
        </div>
    `,
    "n(4n-5)+2|n^3(2-4n)": `
        <div class="math-row flex-row items-center gap-8">
            <span class="fraction-line-wrapper">
                
                <span class="num flex-row items-center justify-center px-4">
                    <span>4</span>
                </span>
                
                <span class="den flex-row items-center justify-center px-4">
                    <span><i class="math-serif">&pi;</i><sup>2</sup></span>
                </span>
                
            </span>
        </div>
    `,
    "8n(n-2)+10|-((2n-1)^4)": `
        <div class="math-row flex-row items-center">
            <span class="fraction-line-wrapper">
                
                <span class="num flex-row items-center justify-center px-4">
                    <span>8</span>
                </span>
                
                <span class="den flex-row items-center justify-center px-4">
                    <span><i class="math-serif">&pi;</i><sup>2</sup></span>
                </span>
                
            </span>
            
            <span class="operator mx-2">+</span>
            <span>1</span>
        </div>
    `,
    "2n-1|n": `
        <div class="math-row flex-row items-center gap-8">
            <span class="fraction-line-wrapper">
                
                <span class="num flex-row items-center justify-center px-4">
                    <span>1</span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-1 px-4">
                    <span><i class="math-serif">&gamma;</i>(3/4, 1/4)</span>
                    
                    <span class="flex-row items-center">
                        <sup style="margin-right: -0.2em; margin-bottom: 0.6em;">4</sup>
                        <span class="sqrt-wrapper">
                            <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                            </svg>
                            <span class="radicand"><i class="math-serif">e</i></span>
                        </span>
                    </span>
                    
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand">2</span>
                    </span>
                </span>
                
            </span>
        </div>
    `,
    "2n-2|n": `
        <div class="math-row flex-row items-center gap-8">
            <span class="fraction-line-wrapper">
                <span class="num flex-row items-center justify-center px-4">
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand">2</span>
                    </span>
                </span>
                
                <span class="den flex-row items-center justify-center gap-2 px-4">
                    <span class="flex-row items-center">
                        <sup style="margin-right: -0.2em; margin-bottom: 0.6em; font-size: 0.7em;">4</sup>
                        <span class="sqrt-wrapper">
                            <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                                <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                            </svg>
                            <span class="radicand"><i class="math-serif">e</i></span>
                        </span>
                    </span>
                    
                    <span><i class="math-serif">&gamma;</i>(1/4, 1/4)</span>
                </span>
            </span>
        </div>
    `,
    "2n|n": `
    <div class="math-row flex-row items-center gap-8">
        <span class="fraction-line-wrapper">
            <span class="num flex-row items-center justify-center px-4">
                <span>1</span>
            </span>
            
            <span class="den flex-row items-center justify-center gap-2 px-4">
                <span class="flex-row items-center">
                    <span>2</span>
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand">2</span>
                    </span>
                </span>

                <span class="flex-row items-center">
                    <sup style="margin-right: -0.2em; margin-bottom: 0.6em; font-size: 0.7em;">4</sup>
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand"><i class="math-serif">e</i></span>
                    </span>
                </span>
                
                <span><i class="math-serif">&gamma;</i>(5/4, 1/4)</span>
            </span>
        </span>
    </div>
`,
"n(7n-8)+3|-(n^3)(12n-6)": `
    <div class="math-row flex-row items-center gap-8">
        <span class="fraction-line-wrapper">
            <span class="num flex-row items-center justify-center px-4">
                <span>27</span>
            </span>
            
            <span class="den flex-row items-center justify-center gap-1 px-4">
                <span>2</span>
                <span><i class="math-serif">&pi;</i><sup>2</sup></span>
            </span>
        </span>
    </div>
`,
"(2n-1)(3n(n-1)+1)|n^4(4n-1)(4n+1)": `
    <div class="math-row flex-row items-center gap-8">
        <span class="fraction-line-wrapper">
            <span class="num flex-row items-center justify-center px-4">
                <span>15</span>
            </span>
            
            <span class="den flex-row items-center justify-center px-4">
                <span><i class="math-serif">&pi;</i><sup>2</sup></span>
            </span>
        </span>
    </div>
`,
"(2n-1)(13n(n-1)+4)|3n^4(3n-1)(3n+1)": `
    <div class="math-row flex-row items-center gap-8">
        <span class="fraction-line-wrapper">
            <span class="num flex-row items-center justify-center px-4">
                <span>42</span>
            </span>
            
            <span class="den flex-row items-center justify-center px-4">
                <span><i class="math-serif">&pi;</i><sup>2</sup></span>
            </span>
        </span>
    </div>
`,
"2n(4n+1)+1|-2(2n+1)^3(n+1)": `
    <div class="math-row flex-row items-center gap-8">
        <span class="fraction-line-wrapper">
            <span class="num flex-row items-center justify-center px-4">
                <span>4<i class="math-serif">G</i></span>
            </span>
            
            <span class="den flex-row items-center justify-center px-4">
                <span>2<i class="math-serif">G</i> - 1</span>
            </span>
        </span>
    </div>
`,
"2n(4n-7)+7|-2n(2n-1)^3": `
    <div class="math-row flex-row items-center gap-8">
        <span class="fraction-line-wrapper">
            <span class="num flex-row items-center justify-center px-4">
                <span>1</span>
            </span>
            
            <span class="den flex-row items-center justify-center px-4">
                <span>2<i class="math-serif">G</i></span>
            </span>
        </span>
    </div>
`,
"12n(n+1)-1|n(n+2)(2n+1)^2(2n+3)^2": `
    <div class="math-row flex-row items-center gap-2">
        <span class="fraction-line-wrapper">
            <span class="num flex-row items-center justify-center px-4">
                <span>16</span>
            </span>
            
            <span class="den flex-row items-center justify-center px-4">
                <span>17 - 18<i class="math-serif">G</i></span>
            </span>
        </span>
        
        <span style="margin-left: 4px;">&minus; 2</span>
    </div>
`,
"8n(n-1)+7|-((2n)^4)": `
    <div class="math-row flex-row items-center gap-8">
        <span class="fraction-line-wrapper">
            <span class="num flex-row items-center justify-center px-4">
                <span>1</span>
            </span>
            
            <span class="den flex-row items-center justify-center px-4">
                <span>2 - 2<i class="math-serif">G</i></span>
            </span>
        </span>
    </div>
`,
"7n^2-2n-1|n^3(8n-4)": `
    <div class="math-row flex-row items-center gap-8">
        <span class="fraction-line-wrapper">
            <span class="num flex-row items-center justify-center px-4">
                <span>2</span>
            </span>
            
            <span class="den flex-row items-center justify-center px-4">
                <span class="math-serif">ln</span><sup style="margin-bottom: .5em;">2</sup>(2)
            </span>
        </span>
    </div>
`,
"24n(n-2)+26|(2n-1)^6": `
    <div class="math-row flex-row items-center gap-2">
        <span class="fraction-line-wrapper">
            <span class="num flex-row items-center justify-center px-4">
                <span>32</span>
            </span>
            
            <span class="den flex-row items-center justify-center px-4">
                <span><i class="math-serif">&pi;</i><sup>3</sup></span>
            </span>
        </span>
        
        <span style="margin-left: 4px;">+ 1</span>
    </div>
`,
"(4n-4)(4n(n-2)+7)|-((2n-1)^6)": `
    <div class="math-row flex-row items-center gap-2">
        <span class="fraction-line-wrapper">
            <span class="num flex-row items-center justify-center px-4">
                <span>8</span>
            </span>
            
            <span class="den flex-row items-center justify-center px-4">
                <span>7 <i class="math-serif">&zeta;</i>(3)</span>
            </span>
        </span>
        
        <span style="margin-left: 4px;">&minus; 1</span>
    </div>
`,
"(4n-2)(2n)^2+22n-3|-((2n)^2)(2n+1)^4": `
    <div class="math-row flex-row items-center gap-8">
        <span class="fraction-line-wrapper">
            <span class="num flex-row items-center justify-center px-4">
                <span>2</span>
            </span>
            
            <span class="den flex-row items-center justify-center px-4" style="white-space: nowrap;">
                <span>
                    7 <i class="math-serif">&zeta;</i>(3) &minus; 
                    2 <i class="math-serif">&pi;G</i> + 
                    3 <i class="math-serif">&pi;</i> &minus; 12
                </span>
            </span>
        </span>
    </div>
`,
"8n+3|(n+1)^2(2n-1)(2n+3)": `
    <div class="math-row flex-row items-center gap-2">
        <span style="margin-right: 4px;">1 &minus;</span>

        <span class="fraction-line-wrapper">
            <span class="num flex-row items-center justify-center px-4">
                <span>4</span>
            </span>
            
            <span class="den flex-row items-center justify-center px-4">
                <span>4 <span class="math-serif">ln</span>(2) &minus; <i class="math-serif">&pi;</i></span>
            </span>
        </span>
    </div>
`,
"8n-3|n^2(2n-1)(2n+3)": `
    <div class="math-row flex-row items-center gap-8">
        <span class="fraction-line-wrapper">
            <span class="num flex-row items-center justify-center px-4">
                <span>12</span>
            </span>
            
            <span class="den flex-row items-center justify-center px-4" style="white-space: nowrap;">
                <span>
                    20 &minus; 3<i class="math-serif">&pi;</i> &minus; 12 <span class="math-serif">ln</span>(2)
                </span>
            </span>
        </span>
    </div>
`,
"3|(3n-1)^2": `
    <div class="math-row flex-row items-center gap-2">
        <span style="margin-right: 4px;">1 +</span>

        <span class="fraction-line-wrapper">
            <span class="num flex-row items-center justify-center px-4">
                <span>9</span>
            </span>
            
            <span class="den flex-row items-center justify-center px-4" style="white-space: nowrap;">
                <span class="flex-row items-center">
                    <span class="sqrt-wrapper">
                        <svg class="sqrt-tick" viewBox="0 0 12 22" preserveAspectRatio="none">
                            <path d="M1,13 L3,13 L6,21 L11,0.5" stroke="currentColor" fill="none" stroke-width="1" vector-effect="non-scaling-stroke"/>
                        </svg>
                        <span class="radicand">3</span>
                    </span>
                    <i class="math-serif">&pi;</i> &minus; 3 <span class="math-serif">ln</span>(2)
                </span>
            </span>
        </span>
    </div>
`
};

function render() {
    const aStr = inputA.value.trim() || "0";
    const bStr = inputB.value.trim() || "0";

    let maxDepth = 4;

    if (isFactoredView) {
        // 1. Get the actual rendered HTML for the 'a' string (using n=1 as the baseline)
        const renderedA = getDisplayText(aStr, 1, true);
        
        // 2. Strip out the HTML tags to get the true visual character length
        const visibleTextLength = String(renderedA).replace(/<[^>]*>?/gm, '').length;
        
        // 3. Throttle depth if the visible simplified string is too long
        if (visibleTextLength > 8) {
            maxDepth = 3;
        }
    }

    display.innerHTML = buildFraction(aStr, bStr, maxDepth, 1);

    const result = calculateValue(aStr, bStr);
    
    if (isNaN(result) || !isFinite(result)) {
        decimalValue.innerText = "---";
        termCount.innerText = "First 0 terms";
        exactContainer.style.opacity = "0";
        exactContainer.style.transform = "translateX(20px)";
        return; 
    } 

    decimalValue.innerText = result.toFixed(10) + "...";
    termCount.innerText = "First 2500 terms";

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
        const testPoints = [2, 3, 5, 7, 11]; // Testing at a few primes avoids false overlaps
        
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

const suggestA = document.getElementById('suggestA');
const suggestB = document.getElementById('suggestB');

function updatePills(activeInput) {
    const valA = inputA.value.replace(/\s+/g, '');
    const valB = inputB.value.replace(/\s+/g, '');

    suggestA.innerHTML = '';
    suggestB.innerHTML = '';

    // If BOTH are empty, stay quiet. 
    if (!valA && !valB) return;

    const formulas = Object.keys(KNOWN_FORMULAS);

    const matches = formulas.filter(key => {
        const [knownA, knownB] = key.split('|');
        const cleanA = knownA.replace(/\s+/g, '');
        const cleanB = knownB.replace(/\s+/g, '');

        if (activeInput === 'A') {
            const strictMatchB = valB === '' || cleanB === valB;
            const fuzzyMatchA = valA === '' || cleanA.includes(valA);
            return strictMatchB && fuzzyMatchA;
        } else {
            const strictMatchA = valA === '' || cleanA === valA;
            const fuzzyMatchB = valB === '' || cleanB.includes(valB);
            return strictMatchA && fuzzyMatchB;
        }
    });

    if (matches.length === 0) return;

    // Suggest for A if A is active (even if A is blank, as long as B has something)
    if (activeInput === 'A') {
        const suggestionsForA = [...new Set(matches.map(key => key.split('|')[0]))]
            .filter(a => a.replace(/\s+/g, '') !== valA)
            .slice(0, 3);

        suggestionsForA.forEach(sug => {
            const pill = document.createElement('button');
            pill.className = 'suggestion-pill';
            pill.textContent = sug;
            pill.onclick = () => {
                inputA.value = sug;
                suggestA.innerHTML = '';
                render();
            };
            suggestA.appendChild(pill);
        });
    }

    // Suggest for B if B is active (even if B is blank, as long as A has something)
    if (activeInput === 'B') {
        const suggestionsForB = [...new Set(matches.map(key => key.split('|')[1]))]
            .filter(b => b.replace(/\s+/g, '') !== valB)
            .slice(0, 3);

        suggestionsForB.forEach(sug => {
            const pill = document.createElement('button');
            pill.className = 'suggestion-pill';
            pill.textContent = sug;
            pill.onclick = () => {
                inputB.value = sug;
                suggestB.innerHTML = '';
                render();
            };
            suggestB.appendChild(pill);
        });
    }
}

// Listeners tell the function which input is currently active
inputA.addEventListener('input', () => updatePills('A'));
inputB.addEventListener('input', () => updatePills('B'));
inputA.addEventListener('focus', () => updatePills('A'));
inputB.addEventListener('focus', () => updatePills('B'));

// Clear pills when clicking outside the inputs
document.addEventListener('click', (e) => {
    if (!e.target.closest('.field')) {
        suggestA.innerHTML = '';
        suggestB.innerHTML = '';
    }
});

render();

