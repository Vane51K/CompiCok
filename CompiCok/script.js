// ─────────────────────────────────────────────────────────────
// 1. BACKGROUND ANIMATED GRID CANVAS
// ─────────────────────────────────────────────────────────────
(function initCanvas() {
  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');
  let w, h, particles;

  function resize() {
    w = canvas.width  = window.innerWidth;
    h = canvas.height = window.innerHeight;
  }

  function makeParticles() {
    particles = [];
    const count = Math.floor((w * h) / 14000);
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.2 + 0.3,
        vx: (Math.random() - 0.5) * 0.2,
        vy: (Math.random() - 0.5) * 0.2,
        alpha: Math.random() * 0.5 + 0.1
      });
    }
  }

  function draw() {
    ctx.clearRect(0, 0, w, h);

    // Draw grid lines
    ctx.strokeStyle = 'rgba(0, 245, 255, 0.04)';
    ctx.lineWidth = 1;
    const gridSize = 60;
    for (let x = 0; x < w; x += gridSize) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
    }
    for (let y = 0; y < h; y += gridSize) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }

    // Draw and move particles
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(0, 245, 255, ${p.alpha})`;
      ctx.fill();
    });

    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', () => { resize(); makeParticles(); });
  resize(); makeParticles(); draw();
})();

// ─────────────────────────────────────────────────────────────
// 2. STATE
// ─────────────────────────────────────────────────────────────
let sourceLang = 'en'; // 'en' | 'es'
let analyticsOpen = false;
let isTranslating = false;
let recognition = null; // SpeechRecognition instance

// ─────────────────────────────────────────────────────────────
// 3. ENGLISH → SPANISH TRANSLATION DICTIONARY
// ─────────────────────────────────────────────────────────────
/*
  This dictionary maps English keywords and identifiers to Spanish equivalents.
  In a real backend integration, this would be replaced by a POST /translate call.
*/
const DICT = {
  // Python keywords
  'import':   'importar',
  'from':     'desde',
  'def':      'def',
  'return':   'retorno',
  'print':    'imprimir',
  'if':       'si',
  'else':     'sino',
  'elif':     'sino_si',
  'for':      'para',
  'while':    'mientras',
  'in':       'en',
  'not':      'no',
  'and':      'y',
  'or':       'o',
  'True':     'Verdadero',
  'False':    'Falso',
  'None':     'Nulo',
  'class':    'clase',
  'try':      'intentar',
  'except':   'excepto',
  'finally':  'finalmente',
  'with':     'con',
  'as':       'como',
  'lambda':   'lambda',
  'pass':     'pasar',
  'break':    'romper',
  'continue': 'continuar',
  'raise':    'lanzar',
  'yield':    'ceder',

  // JS / general
  'function': 'funcion',
  'var':      'var',
  'let':      'sea',
  'const':    'constante',
  'this':     'esto',
  'new':      'nuevo',
  'typeof':   'tipoDe',
  'instanceof':'instanciaDe',
  'switch':   'elegir',
  'case':     'caso',
  'default':  'defecto',
  'throw':    'lanzar',
  'console':  'consola',
  'log':      'registro',

  // Standard library / common names
  'math':         'matematicas',
  'calculate_area': 'calcular_area',
  'circle_radius':  'radio_circulo',
  'area':         'area',
  'radius':       'radio',
  'height':       'altura',
  'width':        'ancho',
  'length':       'longitud',
  'size':         'tamano',
  'count':        'contador',
  'index':        'indice',
  'value':        'valor',
  'result':       'resultado',
  'input':        'entrada',
  'output':       'salida',
  'name':         'nombre',
  'age':          'edad',
  'data':         'datos',
  'list':         'lista',
  'dict':         'diccionario',
  'set':          'conjunto',
  'map':          'mapa',
  'key':          'clave',
  'file':         'archivo',
  'path':         'ruta',
  'error':        'error',
  'message':      'mensaje',
  'user':         'usuario',
  'password':     'contrasena',
  'total':        'total',
  'price':        'precio',
  'max':          'maximo',
  'min':          'minimo',
  'sum':          'suma',
  'average':      'promedio',
  'number':       'numero',
  'string':       'cadena',
  'boolean':      'booleano',

  // Comments (partial match)
  'Calculate': 'Calcular',
  'circle':    'circulo',
  'The area':  'El área',
  'with':      'con',
  'is':        'es',
  'of the':    'del',
  'radius':    'radio',
};

// Comment-specific phrase replacements
const COMMENT_PHRASES = [
  ['Calculate circle area',          'Calcular área del círculo'],
  ['Calculate',                       'Calcular'],
  ['Return',                          'Retornar'],
  ['Initialize',                      'Inicializar'],
  ['Check if',                        'Verificar si'],
  ['Loop through',                    'Iterar a través de'],
  ['Print the result',                'Imprimir el resultado'],
  ['The area of the circle',          'El área del círculo'],
  ['the area of the circle',          'el área del círculo'],
];

// f-string content phrases
const FSTRING_PHRASES = [
  ['The area of the circle with radius', 'El área del círculo con radio'],
  ['is',                                 'es'],
];

// ─────────────────────────────────────────────────────────────
// 4. LEXICAL ANALYZER — Token types & tokenizer
// ─────────────────────────────────────────────────────────────
const TOKEN_TYPES = {
  IMPORT_KW:     /^import\b/,
  FROM_KW:       /^from\b/,
  DEF_KW:        /^def\b/,
  RETURN_KW:     /^return\b/,
  PRINT_KW:      /^print\b/,
  IF_KW:         /^if\b/,
  ELIF_KW:       /^elif\b/,
  ELSE_KW:       /^else\b/,
  FOR_KW:        /^for\b/,
  WHILE_KW:      /^while\b/,
  IN_KW:         /^in\b/,
  CLASS_KW:      /^class\b/,
  NOT_KW:        /^not\b/,
  AND_KW:        /^and\b/,
  OR_KW:         /^or\b/,
  TRUE_LIT:      /^True\b/,
  FALSE_LIT:     /^False\b/,
  NONE_LIT:      /^None\b/,
  // JS keywords
  FUNCTION_KW:   /^function\b/,
  VAR_KW:        /^var\b/,
  LET_KW:        /^let\b/,
  CONST_KW:      /^const\b/,
  // Values
  FLOAT:         /^-?\d+\.\d+/,
  INTEGER:       /^-?\d+/,
  STRING_DQ:     /^"(?:[^"\\]|\\.)*"/,
  STRING_SQ:     /^'(?:[^'\\]|\\.)*'/,
  FSTRING:       /^f"(?:[^"\\]|\\.)*"/,
  // Identifiers
  FUNCTION_NAME: null, // resolved contextually
  IDENTIFIER:    /^[a-zA-Z_]\w*/,
  // Operators & punctuation
  ASSIGN:        /^=/,
  EQ:            /^==/,
  NEQ:           /^!=/,
  LEQ:           /^<=/,
  GEQ:           /^>=/,
  LT:            /^</,
  GT:            /^>/,
  STAR_STAR:     /^\*\*/,
  STAR:          /^\*/,
  SLASH:         /^\//,
  PLUS:          /^\+/,
  MINUS:         /^-/,
  PERCENT:       /^%/,
  LEFT_PAREN:    /^\(/,
  RIGHT_PAREN:   /^\)/,
  LEFT_BRACKET:  /^\[/,
  RIGHT_BRACKET: /^\]/,
  LEFT_BRACE:    /^\{/,
  RIGHT_BRACE:   /^\}/,
  COMMA:         /^,/,
  COLON:         /^:/,
  DOT:           /^\./,
  HASH:          /^#/,
  NEWLINE:       /^\n/,
  INDENT:        /^ +/,
  COMMENT:       null, // handled specially
};

const PYTHON_KEYWORDS = new Set([
  'import','from','def','return','print','if','elif','else',
  'for','while','in','class','not','and','or','True','False','None',
  'try','except','finally','with','as','lambda','pass','break','continue',
  'raise','yield','global','nonlocal','del','assert','is'
]);

const JS_KEYWORDS = new Set([
  'function','var','let','const','this','new','typeof','instanceof',
  'switch','case','default','throw','catch','finally','async','await',
  'class','extends','return','if','else','for','while','do','break','continue',
  'true','false','null','undefined'
]);

/**
 * tokenize(code) — Simulated lexical analyzer.
 * Returns an array of token objects: { type, value, line, col, start, end }
 */
function tokenize(code) {
  const tokens = [];
  let i = 0;
  let line = 1;
  let lineStart = 0;
  let prevNonSpace = null; // used to detect function names

  while (i < code.length) {
    const remaining = code.slice(i);
    const col = i - lineStart + 1;

    // Newline
    if (remaining[0] === '\n') {
      tokens.push({ type: 'NEWLINE', value: '\\n', line, col, start: i, end: i + 1 });
      line++;
      lineStart = i + 1;
      i++;
      continue;
    }

    // Whitespace / indent (non-newline)
    if (/^[ \t]+/.test(remaining)) {
      const m = remaining.match(/^[ \t]+/)[0];
      i += m.length;
      continue;
    }

    // Comment
    if (remaining[0] === '#') {
      const end = remaining.indexOf('\n');
      const val = end === -1 ? remaining : remaining.slice(0, end);
      tokens.push({ type: 'COMMENT', value: val, line, col, start: i, end: i + val.length });
      i += val.length;
      continue;
    }

    // f-string (must check before STRING)
    if (/^f["']/.test(remaining)) {
      const m = remaining.match(/^f"(?:[^"\\]|\\.)*"|^f'(?:[^'\\]|\\.)*'/);
      if (m) {
        tokens.push({ type: 'FSTRING', value: m[0], line, col, start: i, end: i + m[0].length });
        i += m[0].length;
        prevNonSpace = 'FSTRING';
        continue;
      }
    }

    // String literals
    let matched = false;
    for (const [type, re] of [['STRING_DQ', /^"(?:[^"\\]|\\.)*"/], ['STRING_SQ', /^'(?:[^'\\]|\\.)*'/]]) {
      if (re.test(remaining)) {
        const m = remaining.match(re)[0];
        tokens.push({ type, value: m, line, col, start: i, end: i + m.length });
        i += m.length;
        prevNonSpace = type;
        matched = true;
        break;
      }
    }
    if (matched) continue;

    // Float before Integer
    if (/^-?\d+\.\d+/.test(remaining)) {
      const m = remaining.match(/^-?\d+\.\d+/)[0];
      tokens.push({ type: 'FLOAT', value: m, line, col, start: i, end: i + m.length });
      i += m.length;
      prevNonSpace = 'FLOAT';
      continue;
    }

    // Integer
    if (/^\d+/.test(remaining)) {
      const m = remaining.match(/^\d+/)[0];
      tokens.push({ type: 'INTEGER', value: m, line, col, start: i, end: i + m.length });
      i += m.length;
      prevNonSpace = 'INTEGER';
      continue;
    }

    // Identifier / keywords
    if (/^[a-zA-Z_]\w*/.test(remaining)) {
      const m = remaining.match(/^[a-zA-Z_]\w*/)[0];
      let type = 'IDENTIFIER';

      if (PYTHON_KEYWORDS.has(m) || JS_KEYWORDS.has(m)) {
        type = m.toUpperCase() + '_KW';
        if (!['IMPORT','FROM','DEF','RETURN','PRINT','IF','ELIF','ELSE',
              'FOR','WHILE','IN','CLASS','FUNCTION','VAR','LET','CONST',
              'AND','OR','NOT'].includes(m.toUpperCase())) {
          type = m.toUpperCase() + '_KW';
        }
      }

      // Detect if next meaningful token is '(' → it's a function name
      const rest = code.slice(i + m.length).replace(/^[ \t]*/, '');
      if (rest[0] === '(' && type === 'IDENTIFIER') {
        type = 'FUNCTION_NAME';
      }

      tokens.push({ type, value: m, line, col, start: i, end: i + m.length });
      i += m.length;
      prevNonSpace = type;
      continue;
    }

    // Operators & punctuation (order matters: multi-char first)
    const operators = [
      ['STAR_STAR', '**'], ['EQ','=='], ['NEQ','!='], ['LEQ','<='], ['GEQ','>='],
      ['ARROW','->'], ['PLUS','+'], ['MINUS','-'], ['STAR','*'], ['SLASH','/'],
      ['PERCENT','%'], ['LT','<'], ['GT','>'], ['ASSIGN','='],
      ['LEFT_PAREN','('], ['RIGHT_PAREN',')'], ['LEFT_BRACKET','['],
      ['RIGHT_BRACKET',']'], ['LEFT_BRACE','{'], ['RIGHT_BRACE','}'],
      ['COMMA',','], ['COLON',':'], ['DOT','.'], ['SEMICOLON',';']
    ];

    let opMatched = false;
    for (const [type, op] of operators) {
      if (remaining.startsWith(op)) {
        tokens.push({ type, value: op, line, col, start: i, end: i + op.length });
        i += op.length;
        prevNonSpace = type;
        opMatched = true;
        break;
      }
    }
    if (opMatched) continue;

    // Unknown character — skip
    i++;
  }

  return tokens;
}

// ─────────────────────────────────────────────────────────────
// 5. SYMBOL TABLE BUILDER
// ─────────────────────────────────────────────────────────────
function buildSymbolTable(tokens) {
  const symbols = [];
  const seen = new Set();

  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];

    // Variable assignment:  IDENTIFIER ASSIGN
    if (tok.type === 'IDENTIFIER' || tok.type === 'FUNCTION_NAME') {
      const next = tokens[i + 1];

      if (next && next.type === 'ASSIGN' && !seen.has(tok.value)) {
        // Look for the value token after '='
        const valTok = tokens[i + 2];
        let valStr = valTok ? valTok.value : '?';
        let typeStr = valTok
          ? (valTok.type === 'FLOAT' || valTok.type === 'INTEGER' ? 'number'
          : valTok.type.includes('STRING') ? 'string'
          : valTok.type === 'FSTRING' ? 'f-string'
          : valTok.type === 'FUNCTION_NAME' ? 'call'
          : 'any')
          : 'any';

        symbols.push({
          id: tok.value,
          type: typeStr,
          scope: 'global',
          line: tok.line,
          value: valStr
        });
        seen.add(tok.value);
      }

      // Function definition: DEF_KW FUNCTION_NAME
      if (tok.type === 'FUNCTION_NAME' && i > 0 && tokens[i - 1] && tokens[i - 1].value === 'def') {
        if (!seen.has(tok.value)) {
          symbols.push({
            id: tok.value,
            type: 'function',
            scope: 'global',
            line: tok.line,
            value: '()'
          });
          seen.add(tok.value);
        }
      }
    }
  }

  return symbols;
}

// ─────────────────────────────────────────────────────────────
// 6. ERROR DETECTOR
// ─────────────────────────────────────────────────────────────
const PYTHON_UNDEFINED = new Set(['print']); // `print` is not auto-detected as keyword

function detectErrors(code, tokens) {
  const errors = [];

  // Check for `print` usage (Python 2 vs 3 note)
  tokens.forEach(tok => {
    if (tok.type === 'PRINT_KW' || tok.value === 'print') {
      // Check if it lacks parentheses (very basic check)
      const rest = code.split('\n')[tok.line - 1] || '';
      if (!rest.includes('print(')) {
        errors.push({
          severity: 'ERROR',
          line: tok.line,
          col: tok.col,
          phase: 'Lexical',
          message: `Unexpected token 'print'. Semantic error: 'print' undefined. Use 'imprimir'.`,
          hint: "Use imprimir(...) in Spanish mode"
        });
      }
    }
  });

  // Unmatched parentheses
  let depth = 0;
  tokens.forEach(tok => {
    if (tok.type === 'LEFT_PAREN')  depth++;
    if (tok.type === 'RIGHT_PAREN') depth--;
    if (depth < 0) {
      errors.push({
        severity: 'ERROR',
        line: tok.line,
        col: tok.col,
        phase: 'Syntactic',
        message: `Unexpected ')' — no matching '('`,
        hint: "Check opening parentheses"
      });
      depth = 0;
    }
  });
  if (depth > 0) {
    errors.push({
      severity: 'WARNING',
      line: '?',
      col: '?',
      phase: 'Syntactic',
      message: `${depth} unclosed parenthes${depth > 1 ? 'es' : 'is'} detected`,
      hint: "Add closing ')' where needed"
    });
  }

  // Trailing whitespace warning
  const lines = code.split('\n');
  lines.forEach((l, idx) => {
    if (l !== l.trimEnd()) {
      errors.push({
        severity: 'INFO',
        line: idx + 1,
        col: l.trimEnd().length + 1,
        phase: 'Lexical',
        message: `Trailing whitespace on line ${idx + 1}`,
        hint: "Remove trailing spaces"
      });
    }
  });

  return errors;
}

// ─────────────────────────────────────────────────────────────
// 7. SIMPLE AST BUILDER
// ─────────────────────────────────────────────────────────────
function buildAST(tokens) {
  // Lightweight: build a simplified tree from top-level constructs
  const root = { label: 'PROGRAM', type: 'root', children: [] };

  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];

    if (tok.value === 'import' || tok.value === 'from') {
      const mod = tokens[i + 1];
      root.children.push({
        label: `IMPORT`,
        type: 'func',
        children: [{ label: mod ? mod.value : '?', type: 'leaf', children: [] }]
      });
      i += 2;
      continue;
    }

    if (tok.value === 'def') {
      const fname = tokens[i + 1];
      const node = { label: `FUNC_DEF`, type: 'func', children: [] };
      if (fname) {
        node.children.push({ label: fname.value, type: 'leaf', children: [] });
      }
      // Find params (tokens between parens)
      let j = i + 2;
      while (j < tokens.length && tokens[j].type !== 'COLON' && tokens[j].type !== 'NEWLINE') {
        if (tokens[j].type === 'IDENTIFIER') {
          node.children.push({ label: tokens[j].value, type: 'leaf', children: [] });
        }
        j++;
      }
      root.children.push(node);
      i = j + 1;
      continue;
    }

    if (tok.type === 'IDENTIFIER' && tokens[i + 1] && tokens[i + 1].type === 'ASSIGN') {
      const valTok = tokens[i + 2];
      root.children.push({
        label: 'ASSIGN',
        type: 'func',
        children: [
          { label: tok.value, type: 'leaf', children: [] },
          { label: valTok ? valTok.value : '?', type: 'leaf', children: [] }
        ]
      });
      i += 3;
      continue;
    }

    i++;
  }

  return root;
}

// ─────────────────────────────────────────────────────────────
// 8. AST RENDERER (HTML tree)
// ─────────────────────────────────────────────────────────────
function renderASTNode(node) {
  const div = document.createElement('div');
  div.className = 'ast-node';

  const box = document.createElement('div');
  box.className = `ast-box ${node.type}`;
  box.textContent = node.label;
  div.appendChild(box);

  if (node.children && node.children.length > 0) {
    const line = document.createElement('div');
    line.className = 'ast-line';
    div.appendChild(line);

    const childRow = document.createElement('div');
    childRow.className = 'ast-children';
    node.children.forEach(child => {
      const childWrap = document.createElement('div');
      childWrap.style.display = 'flex';
      childWrap.style.flexDirection = 'column';
      childWrap.style.alignItems = 'center';
      const childLine = document.createElement('div');
      childLine.className = 'ast-line';
      childWrap.appendChild(childLine);
      childWrap.appendChild(renderASTNode(child));
      childRow.appendChild(childWrap);
    });
    div.appendChild(childRow);
  }

  return div;
}

// ─────────────────────────────────────────────────────────────
// 9. SEMANTIC ANALYZER
// ─────────────────────────────────────────────────────────────
function runSemanticAnalysis(tokens, symbols, errors) {
  const result = {
    typeChecking: 'Passed',
    scopeResolution: 'Passed',
    declarations: symbols.length,
    undefinedRefs: 0,
    redeclarations: 0,
    status: 'OK',
    log: []
  };

  // Check for undefined identifiers (simple: not in symbol table and not a keyword)
  const declaredIds = new Set(symbols.map(s => s.id));
  const usedIds = tokens
    .filter(t => t.type === 'IDENTIFIER' || t.type === 'FUNCTION_NAME')
    .map(t => t.value);

  usedIds.forEach(id => {
    if (!declaredIds.has(id) && !PYTHON_KEYWORDS.has(id) && !JS_KEYWORDS.has(id)) {
      result.log.push({ level: 'warn', msg: `Identifier '${id}' used but not declared in current scope` });
      result.undefinedRefs++;
    }
  });

  // Check for redeclarations
  const seenDecl = {};
  symbols.forEach(s => {
    if (seenDecl[s.id]) {
      result.redeclarations++;
      result.log.push({ level: 'err', msg: `'${s.id}' redeclared on line ${s.line}` });
    }
    seenDecl[s.id] = true;
  });

  // Type checking pass
  if (errors.some(e => e.severity === 'ERROR')) {
    result.typeChecking = 'Failed';
    result.status = 'ERRORS';
  }

  result.log.unshift({ level: 'ok', msg: `Semantic analysis started — ${tokens.length} tokens processed` });
  result.log.push({ level: 'ok', msg: `${symbols.length} declarations resolved` });

  if (result.undefinedRefs > 0) {
    result.status = 'WARNINGS';
    result.log.push({ level: 'warn', msg: `${result.undefinedRefs} possibly undefined reference(s)` });
  } else {
    result.log.push({ level: 'ok', msg: `All references resolved` });
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// 10. TRANSLATOR ENGINE
// ─────────────────────────────────────────────────────────────
/**
 * translateCode(code) — Main translation function.
 * Works token-by-token using the DICT lookup table.
 * In a real app, this is where you'd call POST /translate on your Flask backend.
 */
function translateCode(code) {
  const lines = code.split('\n');
  const translated = lines.map(line => {
    // Handle comments separately
    if (line.trim().startsWith('#')) {
      let comment = line;
      // Apply phrase replacements
      COMMENT_PHRASES.forEach(([en, es]) => {
        comment = comment.replace(en, es);
      });
      return comment;
    }

    // Replace f-string content
    let result = line.replace(/f"([^"]*)"/g, (match, content) => {
      let out = content;
      FSTRING_PHRASES.forEach(([en, es]) => { out = out.replace(en, es); });
      return `f"${out}"`;
    });

    // Token-by-token replacement using word boundaries
    const words = result.split(/\b/);
    const replaced = words.map(w => {
      if (DICT[w]) return DICT[w];
      return w;
    });

    return replaced.join('');
  });

  return translated.join('\n');
}

// ─────────────────────────────────────────────────────────────
// 11. MAIN TRANSLATE ACTION
// ─────────────────────────────────────────────────────────────
async function translate() {
  if (isTranslating) return;
  const inputEl = document.getElementById('input-text');
  const code = inputEl.value.trim();

  if (!code) {
    showToast('Please enter some code or text to translate', 'error');
    return;
  }

  isTranslating = true;
  setStatus('Compiling…', 'processing');

  // Show loading UI
  document.getElementById('btn-translate').classList.add('loading');
  document.getElementById('output-loading').removeAttribute('hidden');

  // Simulate async compile delay (replace with real fetch for Flask)
  await sleep(900 + Math.random() * 400);

  // ── Run compiler phases ──
  const tokens   = tokenize(code);
  const symbols  = buildSymbolTable(tokens);
  const errors   = detectErrors(code, tokens);
  const ast      = buildAST(tokens);
  const semantic = runSemanticAnalysis(tokens, symbols, errors);
  const output   = translateCode(code);

  // ── Render results ──
  renderOutput(output);
  renderTokens(tokens);
  renderSymbolTable(symbols);
  renderErrors(errors);
  renderAST(ast);
  renderSemantic(semantic);

  // ── Update token badge ──
  document.getElementById('token-count-badge').textContent =
    `${tokens.length} tokens`;

  // ── Open analytics ──
  openAnalytics();

  // ── Status ──
  const errCount = errors.filter(e => e.severity === 'ERROR').length;
  const warnCount = errors.filter(e => e.severity === 'WARNING').length;

  if (errCount > 0) {
    setStatus(`Translation complete — ${errCount} error(s), ${warnCount} warning(s)`, 'error');
    showErrorBanner(errors.filter(e => e.severity === 'ERROR'));
  } else {
    setStatus(`Translation complete — ${tokens.length} tokens | ${symbols.length} symbols | ${warnCount} warning(s)`, 'ok');
    document.getElementById('error-banner').hidden = true;
  }

  document.getElementById('btn-translate').classList.remove('loading');
  document.getElementById('output-loading').setAttribute('hidden', '');
  isTranslating = false;

  showToast('Translation complete!', 'success');
}

// ─────────────────────────────────────────────────────────────
// 12. RENDER FUNCTIONS
// ─────────────────────────────────────────────────────────────

/** Render translated code into the output panel */
function renderOutput(text) {
  const el = document.getElementById('output-text');
  el.innerHTML = ''; // clear

  if (!text.trim()) {
    el.innerHTML = '<span class="output-placeholder">// La traducción aparecerá aquí...</span>';
    return;
  }

  // Syntax highlighting (simple keyword coloring for the output)
  const highlighted = syntaxHighlight(text);
  el.innerHTML = highlighted;

  // Update output stats
  const lines = text.split('\n').length;
  const chars = text.length;
  document.getElementById('output-stats').textContent = `${chars} chars | ${lines} lines`;

  // Update output line numbers
  updateLineNums('line-nums-out', lines);
}

/** Apply basic syntax highlighting to translated code */
function syntaxHighlight(code) {
  const lines = code.split('\n');
  return lines.map(line => {
    let escaped = escapeHtml(line);

    // Comments
    escaped = escaped.replace(/(#[^\n]*)/, '<span style="color:#6272a4">$1</span>');
    // Strings
    escaped = escaped.replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g,
      '<span style="color:#f1fa8c">$1</span>');
    // Keywords (Spanish)
    const kwEs = ['importar','def','retorno','imprimir','si','sino','para','mientras','en',
                  'clase','no','y','o','Verdadero','Falso','Nulo'];
    kwEs.forEach(kw => {
      const re = new RegExp(`\\b(${kw})\\b`, 'g');
      escaped = escaped.replace(re, '<span style="color:#ff79c6">$1</span>');
    });
    // Numbers
    escaped = escaped.replace(/\b(\d+\.?\d*)\b/g, '<span style="color:#bd93f9">$1</span>');

    return escaped;
  }).join('\n');
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Render token list */
function renderTokens(tokens) {
  const list = document.getElementById('token-list');
  list.innerHTML = '';

  tokens
    .filter(t => t.type !== 'NEWLINE') // skip visual noise
    .forEach((tok, idx) => {
      const row = document.createElement('div');
      row.className = 'token-row';

      row.innerHTML = `
        <div class="tok-cell tok-line">L:${tok.line}</div>
        <div class="tok-cell tok-type tt-${tok.type}">${tok.type}</div>
        <div class="tok-cell tok-value">${escapeHtml(tok.value)}</div>
        <div class="tok-cell tok-span">(${tok.start},${tok.end})</div>
      `;
      list.appendChild(row);
    });
}

/** Render symbol table */
function renderSymbolTable(symbols) {
  const tbody = document.getElementById('symbol-tbody');
  tbody.innerHTML = '';

  if (symbols.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">No symbols detected.</td></tr>';
    return;
  }

  symbols.forEach((sym, idx) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td style="color:var(--cyan)">${escapeHtml(sym.id)}</td>
      <td style="color:var(--amber)">${sym.type}</td>
      <td style="color:var(--purple)">${sym.scope}</td>
      <td>${sym.line}</td>
      <td style="color:var(--text-code)">${escapeHtml(sym.value)}</td>
    `;
    tbody.appendChild(tr);
  });
}

/** Render error table */
function renderErrors(errors) {
  const tbody = document.getElementById('error-tbody');
  tbody.innerHTML = '';

  if (errors.length === 0) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="6">✓ No errors detected. Great code!</td></tr>';
    return;
  }

  errors.forEach(err => {
    const tr = document.createElement('tr');
    const sevClass = err.severity === 'ERROR' ? 'sev-error'
                   : err.severity === 'WARNING' ? 'sev-warning' : 'sev-info';
    tr.innerHTML = `
      <td><span class="${sevClass}">${err.severity}</span></td>
      <td>${err.line}</td>
      <td>${err.col || '—'}</td>
      <td style="color:var(--text-muted)">${err.phase}</td>
      <td style="color:var(--text-secondary)">${escapeHtml(err.message)}</td>
      <td style="color:var(--green);font-size:10px">${escapeHtml(err.hint)}</td>
    `;
    tbody.appendChild(tr);
  });
}

/** Show error banner below error table */
function showErrorBanner(errors) {
  const banner = document.getElementById('error-banner');
  banner.hidden = false;
  banner.innerHTML = errors.map(e =>
    `[ ERROR ] Line ${e.line}: ${escapeHtml(e.message)}`
  ).join('<br>');
}

/** Render AST */
function renderAST(ast) {
  const wrap = document.getElementById('tree-wrap');
  wrap.innerHTML = '';

  const container = document.createElement('div');
  container.className = 'ast-container';
  container.style.overflowX = 'auto';
  container.style.display = 'flex';
  container.style.justifyContent = 'center';

  const tree = renderASTNode(ast);
  container.appendChild(tree);
  wrap.appendChild(container);
}

/** Render semantic analysis */
function renderSemantic(sem) {
  const setVal = (id, val, cls) => {
    const el = document.getElementById(id);
    el.textContent = val;
    el.className = `sem-value ${cls || ''}`;
  };

  setVal('sem-type',   sem.typeChecking,
    sem.typeChecking === 'Passed' ? 'sem-ok' : 'sem-err');
  setVal('sem-scope',  sem.scopeResolution,
    sem.scopeResolution === 'Passed' ? 'sem-ok' : 'sem-err');
  setVal('sem-decl',   sem.declarations + ' found', '');
  setVal('sem-undef',  sem.undefinedRefs > 0 ? sem.undefinedRefs + ' found' : 'None',
    sem.undefinedRefs > 0 ? 'sem-warn' : 'sem-ok');
  setVal('sem-redecl', sem.redeclarations > 0 ? sem.redeclarations + ' found' : 'None',
    sem.redeclarations > 0 ? 'sem-err' : 'sem-ok');
  setVal('sem-status', sem.status,
    sem.status === 'OK' ? 'sem-ok' : sem.status === 'WARNINGS' ? 'sem-warn' : 'sem-err');

  // Log
  const logEl = document.getElementById('sem-log-entries');
  logEl.innerHTML = '';
  const now = new Date().toLocaleTimeString();

  sem.log.forEach(entry => {
    const div = document.createElement('div');
    div.className = 'sem-log-entry';
    const cls = entry.level === 'ok' ? 'log-ok'
              : entry.level === 'err' ? 'log-err' : 'log-warn';
    const icon = entry.level === 'ok' ? '✓' : entry.level === 'err' ? '✗' : '⚠';
    div.innerHTML = `
      <span class="log-ts">[${now}]</span>
      <span class="${cls}">${icon}</span>
      <span class="log-msg">${escapeHtml(entry.msg)}</span>
    `;
    logEl.appendChild(div);
  });
}

// ─────────────────────────────────────────────────────────────
// 13. INPUT HANDLING
// ─────────────────────────────────────────────────────────────

/** Update char counter and line numbers as user types */
function onInputChange() {
  const input = document.getElementById('input-text');
  const val = input.value;
  const len = val.length;
  const lines = val.split('\n').length;

  // Char counter
  const counter = document.getElementById('char-counter');
  counter.textContent = `${len} / 2000`;
  counter.style.color = len > 1800 ? 'var(--red)' : len > 1400 ? 'var(--amber)' : '';

  // Cap input
  if (len > 2000) {
    input.value = val.slice(0, 2000);
  }

  // Update source line numbers
  updateLineNums('line-nums-src', lines);
}

function updateLineNums(elId, count) {
  const el = document.getElementById(elId);
  el.textContent = Array.from({ length: count }, (_, i) => i + 1).join('\n');
}

/** Sync textarea scroll with line numbers */
document.addEventListener('DOMContentLoaded', () => {
  feather.replace(); // Initialize Feather icons

  const input = document.getElementById('input-text');
  const lineNumsSrc = document.getElementById('line-nums-src');
  const output = document.getElementById('output-text');
  const lineNumsOut = document.getElementById('line-nums-out');

  input.addEventListener('scroll', () => {
    lineNumsSrc.scrollTop = input.scrollTop;
  });

  // Load initial example
  loadSample('python');
});

// ─────────────────────────────────────────────────────────────
// 14. SAMPLE CODE LOADER
// ─────────────────────────────────────────────────────────────
const SAMPLES = {
  python: `import math

def calculate_area(radius):
    # Calculate circle area
    return math.pi * pow(radius, 2)

circle_radius = 5.0
area = calculate_area(circle_radius)
print(f"The area of the circle with radius {circle_radius} is: {area:.2f}")`,

  js: `// JavaScript Sample
function greetUser(name, age) {
    // Check if age is valid
    if (age < 0) {
        return "Invalid age";
    }
    let message = "Hello, " + name;
    let result = calculate(age * 2);
    return message;
}

const user = greetUser("Alice", 25);
console.log(user);`,

  generic: `# Generic text/pseudocode sample
import data

def process_data(input):
    # Initialize result
    result = calculate(input)
    if result > 0:
        return result
    else:
        return None

total = process_data(42)
print(total)`
};

function loadSample(type) {
  const input = document.getElementById('input-text');
  input.value = SAMPLES[type] || SAMPLES.python;
  onInputChange();
  document.getElementById('more-menu').hidden = true;
  showToast(`${type.toUpperCase()} sample loaded`, 'info');
}

// ─────────────────────────────────────────────────────────────
// 15. FILE UPLOAD
// ─────────────────────────────────────────────────────────────
function uploadFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  if (!file.name.endsWith('.txt')) {
    showToast('Only .txt files are supported', 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('input-text').value = e.target.result.slice(0, 2000);
    onInputChange();
    showToast(`File "${file.name}" loaded`, 'success');
  };
  reader.readAsText(file);
}

// ─────────────────────────────────────────────────────────────
// 16. EXPORT OUTPUT
// ─────────────────────────────────────────────────────────────
function exportOutput() {
  const content = document.getElementById('output-text').innerText;
  if (!content || content.includes('La traducción aparecerá')) {
    showToast('Nothing to export yet. Translate something first.', 'error');
    return;
  }
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'compicok_output.txt';
  a.click();
  URL.revokeObjectURL(url);
  showToast('Output exported!', 'success');
}

// ─────────────────────────────────────────────────────────────
// 17. COPY OUTPUT
// ─────────────────────────────────────────────────────────────
function copyOutput() {
  const text = document.getElementById('output-text').innerText;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Copied to clipboard!', 'success');
  }).catch(() => showToast('Copy failed', 'error'));
}

// ─────────────────────────────────────────────────────────────
// 18. VOICE RECOGNITION
// ─────────────────────────────────────────────────────────────
function startVoice() {
  if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
    showToast('Voice recognition not supported in this browser', 'error');
    return;
  }

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.lang = sourceLang === 'en' ? 'en-US' : 'es-ES';
  recognition.continuous = false;
  recognition.interimResults = false;

  const voiceBtn = document.getElementById('voice-btn');
  voiceBtn.classList.add('active');

  recognition.onresult = e => {
    const transcript = e.results[0][0].transcript;
    document.getElementById('input-text').value += transcript + ' ';
    onInputChange();
    voiceBtn.classList.remove('active');
    showToast('Voice input captured!', 'success');
  };

  recognition.onerror = () => {
    voiceBtn.classList.remove('active');
    showToast('Voice recognition error. Try again.', 'error');
  };

  recognition.onend = () => voiceBtn.classList.remove('active');
  recognition.start();
}

// ─────────────────────────────────────────────────────────────
// 19. TEXT-TO-SPEECH OUTPUT
// ─────────────────────────────────────────────────────────────
function listenOutput() {
  const text = document.getElementById('output-text').innerText;
  if (!text || text.includes('La traducción')) {
    showToast('Nothing to listen to yet', 'error');
    return;
  }
  const utterance = new SpeechSynthesisUtterance(text.slice(0, 500));
  utterance.lang = 'es-ES';
  utterance.rate = 0.85;
  window.speechSynthesis.speak(utterance);
  showToast('Speaking…', 'info');
}

// ─────────────────────────────────────────────────────────────
// 20. CLEAR
// ─────────────────────────────────────────────────────────────
function clearAll() {
  document.getElementById('input-text').value = '';
  document.getElementById('output-text').innerHTML =
    '<span class="output-placeholder">// La traducción aparecerá aquí...</span>';
  document.getElementById('char-counter').textContent = '0 / 2000';
  document.getElementById('output-stats').textContent = '0 chars | 0 lines';
  document.getElementById('token-count-badge').textContent = '0 tokens';
  updateLineNums('line-nums-src', 1);
  updateLineNums('line-nums-out', 1);
  setStatus('Ready — Enter text or code to translate', 'ready');
  showToast('Cleared!', 'info');
}

// ─────────────────────────────────────────────────────────────
// 21. LANGUAGE CONTROLS
// ─────────────────────────────────────────────────────────────
function setSourceLang(lang) {
  sourceLang = lang;
  document.getElementById('btn-en').classList.toggle('active', lang === 'en');
  document.getElementById('btn-es').classList.toggle('active', lang === 'es');

  document.getElementById('source-lang-label').textContent = lang === 'en' ? 'ENGLISH' : 'ESPAÑOL';
  document.getElementById('output-lang-label').textContent = lang === 'en' ? 'ESPAÑOL' : 'ENGLISH';

  showToast(`Source: ${lang === 'en' ? 'English' : 'Spanish'}`, 'info');
}

function autoDetect() {
  const input = document.getElementById('input-text').value;
  // Simple heuristic: count Spanish-specific characters
  const spanishChars = (input.match(/[ñáéíóúü¿¡]/gi) || []).length;
  const detected = spanishChars > 2 ? 'es' : 'en';
  setSourceLang(detected);
  showToast(`Auto-detected: ${detected === 'en' ? 'English' : 'Spanish'}`, 'info');
}

function swapLanguages() {
  const newLang = sourceLang === 'en' ? 'es' : 'en';
  setSourceLang(newLang);

  // Swap content
  const inputEl = document.getElementById('input-text');
  const outputEl = document.getElementById('output-text');
  const outputText = outputEl.innerText;

  if (outputText && !outputText.includes('traducción')) {
    inputEl.value = outputText;
    onInputChange();
  }
  showToast('Languages swapped!', 'info');
}

// ─────────────────────────────────────────────────────────────
// 22. ANALYTICS TOGGLE
// ─────────────────────────────────────────────────────────────
function toggleAnalytics() {
  const section = document.querySelector('.analytics-section');
  analyticsOpen = !analyticsOpen;
  section.classList.toggle('open', analyticsOpen);
  feather.replace();
}

function openAnalytics() {
  const section = document.querySelector('.analytics-section');
  analyticsOpen = true;
  section.classList.add('open');
  feather.replace();
}

// ─────────────────────────────────────────────────────────────
// 23. TABS
// ─────────────────────────────────────────────────────────────
function switchTab(tabId, btn) {
  // Deactivate all tabs and panels
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));

  // Activate selected
  btn.classList.add('active');
  document.getElementById('tab-' + tabId).classList.add('active');
  feather.replace();
}

// ─────────────────────────────────────────────────────────────
// 24. MORE MENU TOGGLE
// ─────────────────────────────────────────────────────────────
function toggleMoreMenu() {
  const menu = document.getElementById('more-menu');
  menu.hidden = !menu.hidden;
}

// Close more menu on outside click
document.addEventListener('click', e => {
  const menu = document.getElementById('more-menu');
  const btn = document.getElementById('more-btn');
  if (!menu.hidden && !menu.contains(e.target) && !btn.contains(e.target)) {
    menu.hidden = true;
  }
});

// ─────────────────────────────────────────────────────────────
// 25. MODAL (DOCS)
// ─────────────────────────────────────────────────────────────
function showDocs(event) {
  if (event) event.preventDefault();
  const overlay = document.getElementById('modal-overlay');
  overlay.hidden = false;
  overlay.style.display = 'flex';
}
function closeDocs(event) {
  if (event) event.preventDefault();
  const overlay = document.getElementById('modal-overlay');
  overlay.hidden = true;
  overlay.style.display = 'none';
}

// Close docs with Escape key
document.addEventListener('keydown', e => {
  const overlay = document.getElementById('modal-overlay');
  if (e.key === 'Escape' && overlay && !overlay.hidden) {
    closeDocs();
  }
});

// ─────────────────────────────────────────────────────────────
// 26. STATUS BAR
// ─────────────────────────────────────────────────────────────
function setStatus(text, type) {
  const dot = document.querySelector('.status-dot');
  const el  = document.getElementById('status-text');
  el.textContent = text;

  dot.style.background = type === 'error'      ? 'var(--red)'
                        : type === 'processing' ? 'var(--amber)'
                        : 'var(--green)';
  dot.style.boxShadow = type === 'error'       ? 'var(--glow-red)'
                       : type === 'processing'  ? '0 0 10px rgba(255,183,0,0.4)'
                       : 'var(--glow-green)';
}

// ─────────────────────────────────────────────────────────────
// 27. TOAST NOTIFICATIONS
// ─────────────────────────────────────────────────────────────
let toastTimer;
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 3000);
}

// ─────────────────────────────────────────────────────────────
// 28. UTILITIES
// ─────────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }

// Keyboard shortcut: Ctrl+Enter to translate
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    translate();
  }
});

/*
═══════════════════════════════════════════════════════════════
  BACKEND INTEGRATION GUIDE (Flask)
═══════════════════════════════════════════════════════════════
  To connect a real Python Flask backend, replace the
  `translate()` function's simulation with a real fetch:

  async function translate() {
    const code = document.getElementById('input-text').value;

    const res = await fetch('http://localhost:5000/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, lang: sourceLang })
    });

    const data = await res.json();
    // data = { translation, tokens, symbols, errors, ast, semantic }

    renderOutput(data.translation);
    renderTokens(data.tokens);
    renderSymbolTable(data.symbols);
    renderErrors(data.errors);
    // ... etc.
  }

  Flask endpoint:
  @app.route('/translate', methods=['POST'])
  def translate():
      body = request.json
      code = body['code']
      # Run your real compiler/lexer/parser here
      tokens  = my_lexer.tokenize(code)
      symbols = my_parser.symbol_table(tokens)
      errors  = my_semantic.check(tokens)
      output  = my_translator.translate(code)
      return jsonify({
          'translation': output,
          'tokens': tokens,
          'symbols': symbols,
          'errors': errors
      })
═══════════════════════════════════════════════════════════════
*/
