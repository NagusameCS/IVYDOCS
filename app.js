// Initialize Mermaid
mermaid.initialize({ startOnLoad: false, theme: 'default' });

// Register ChartDataLabels plugin
if (typeof ChartDataLabels !== 'undefined') {
    Chart.register(ChartDataLabels);
}

// Define mode aliases for syntax highlighting
CodeMirror.defineMode("chart", function (config) {
    return CodeMirror.getMode(config, "javascript");
});
CodeMirror.defineMode("mermaid", function (config) {
    return CodeMirror.getMode(config, "text/plain");
});
CodeMirror.defineMode("desmos", function (config) {
    return CodeMirror.getMode(config, "javascript");
});
CodeMirror.defineMode("math", function (config) {
    return CodeMirror.getMode(config, "stex");
});

// Initialize CodeMirror
const cmEditor = CodeMirror.fromTextArea(document.getElementById('editor'), {
    mode: 'markdown',
    theme: 'dracula',
    lineNumbers: true,
    lineWrapping: true,
    autoCloseBrackets: true,
    styleActiveLine: true,
    extraKeys: { "Enter": "newlineAndIndentContinueMarkdownList" }
});

// Color Picker Logic
let colorPickr = null;
let activeColorMarker = null;

// Initialize global hidden Pickr instance
function initColorPicker() {
    const container = document.createElement('div');
    container.id = 'global-pickr-container';
    container.style.display = 'none'; // Hidden initially
    document.body.appendChild(container);

    colorPickr = Pickr.create({
        el: container,
        theme: 'nano',
        useAsButton: false,
        default: '#42445a',
        components: {
            preview: true,
            opacity: true,
            hue: true,
            interaction: {
                hex: true,
                rgba: true,
                hsla: true,
                input: true,
                save: true,
                cancel: true
            }
        }
    });

    colorPickr.on('save', (color, instance) => {
        if (activeColorMarker) {
            const newColor = color.toRGBA().toString(0); // Convert to rgba string
            // Or keep original format? User asked for rgba stuff, so rgba is safe.
            // But if it was hex, maybe keep hex?
            // Let's default to rgba for now as requested.

            const range = activeColorMarker.find();
            if (range) {
                cmEditor.replaceRange(newColor, range.from, range.to);
            }
            instance.hide();
        }
    });

    colorPickr.on('hide', () => {
        activeColorMarker = null;
    });
}

// Scan for colors and add widgets
function updateColorPreviews() {
    // Clear existing color bookmarks? 
    // CodeMirror doesn't have a simple "clear all bookmarks of type X".
    // We can track them or just re-scan visible area.
    // For simplicity, let's clear all marks in the viewport that we created.
    // But marks are persistent.
    // Let's just scan and add marks if not present.
    // Actually, clearing all marks is heavy.
    // Let's use `cmEditor.getAllMarks()` and filter.

    const marks = cmEditor.getAllMarks();
    marks.forEach(mark => {
        if (mark.className === 'color-preview-mark') {
            mark.clear();
        }
    });

    const regex = /#(?:[0-9a-fA-F]{3}){1,2}\b|rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)|hsla?\(\s*\d+\s*,\s*\d+%\s*,\s*\d+%\s*(?:,\s*[\d.]+\s*)?\)/g;

    const cursor = cmEditor.getSearchCursor(regex);
    while (cursor.findNext()) {
        const from = cursor.from();
        const to = cursor.to();
        const color = cmEditor.getRange(from, to);

        const widget = document.createElement('span');
        widget.className = 'color-preview-box';
        widget.style.backgroundColor = color;
        widget.title = color;

        // On click, open picker
        widget.onclick = (e) => {
            e.stopPropagation(); // Prevent editor focus change messing things up immediately

            // Set active marker so we know what to replace
            // We need a marker that tracks the text range even if it moves
            activeColorMarker = cmEditor.markText(from, to, { className: 'color-preview-active' });

            // Position picker
            // We can't easily position the global picker at the widget because Pickr 
            // usually attaches to an element.
            // But we can set the color and show it.
            colorPickr.setColor(color);

            // Hack to position: Pickr doesn't have a simple "show at (x,y)" API in all versions.
            // But 'nano' theme usually pops up near the element if we used `useAsButton`.
            // Since we are using a global instance, we might need to move its container?
            // Or just let it center/float.
            // Let's try showing it. If it's centered, that's fine.
            // If we want it near the cursor:
            const rect = widget.getBoundingClientRect();
            const pickrApp = colorPickr.getRoot().app;

            // Ensure pickr is visible before calculating
            colorPickr.show();

            // Move to widget position
            pickrApp.style.top = (rect.bottom + 5) + 'px';
            pickrApp.style.left = rect.left + 'px';
            pickrApp.style.position = 'fixed'; // Use fixed since rect is viewport relative
            pickrApp.style.zIndex = '10000';
        };

        // Add the widget as a bookmark (inserts it at the position, doesn't replace text)
        // Note: `from` is {line, ch} object from getSearchCursor in CM5
        cmEditor.setBookmark(from, { widget: widget, handleMouseEvents: true });

        // We also need to mark this bookmark so we can clear it later?
        // `setBookmark` returns a TextMarker. We didn't save it.
        // But `getAllMarks()` returns them. We can check the widget class.
        // Wait, `getAllMarks` returns markers. Bookmarks are markers.
        // We can check `mark.widgetNode` to identify ours.
    }
}

// Hook into editor changes
cmEditor.on('change', debounce(() => {
    // Only update previews if we are idle? 
    // Or just do it.
    // We need to be careful not to clear marks while typing a color.
    // But for now, full refresh is safest to avoid stale marks.

    // We need to clear old bookmarks first.
    const marks = cmEditor.getAllMarks();
    marks.forEach(mark => {
        if (mark.type === 'bookmark' && mark.widgetNode && mark.widgetNode.classList.contains('color-preview-box')) {
            mark.clear();
        }
    });

    updateColorPreviews();
}, 500));

// Also on scroll/viewport change? 
// Bookmarks move with text, so we don't need to re-render on scroll unless we are virtualizing (CodeMirror 5 does virtualize).
// But bookmarks are part of the doc, so they should persist.
// However, if we have a huge doc, scanning all might be slow.
// For now, let's assume reasonable doc size.

// Init
setTimeout(() => {
    if (typeof Pickr !== 'undefined') {
        initColorPicker();
        updateColorPreviews();
    }
}, 1000);

const preview = document.getElementById('preview');

// Debounce function to prevent excessive rendering
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Main render function
function render() {
    const markdown = cmEditor.getValue();

    const renderer = new marked.Renderer();
    const originalCodeRenderer = renderer.code.bind(renderer);

    renderer.code = (code, language) => {
        const lang = (language || '').trim().toLowerCase();

        if (lang === 'chart') {
            return `<div class="chart-placeholder" data-config="${encodeURIComponent(code)}"></div>`;
        }

        if (lang === 'mermaid') {
            return `<div class="mermaid">${code}</div>`;
        }

        if (lang === 'desmos') {
            return `<div class="desmos-placeholder" data-content="${encodeURIComponent(code)}"></div>`;
        }

        return originalCodeRenderer(code, language);
    };

    renderer.listitem = (text, task, checked) => {
        if (task) {
            // Strip any existing checkbox input to prevent duplicates
            const cleanText = text.replace(/^<input[^>]+>/, '').trim();
            return `<li class="task-list-item"><input type="checkbox" ${checked ? 'checked' : ''} class="task-list-item-checkbox"> ${cleanText}</li>`;
        }
        return `<li>${text}</li>`;
    };

    // Render HTML
    try {
        preview.innerHTML = marked.parse(markdown, {
            renderer: renderer,
            breaks: true,
            gfm: true
        });
    } catch (e) {
        console.error("Markdown parsing error:", e);
        preview.innerHTML = `<p style="color:red">Error parsing markdown: ${e.message}</p>`;
        return;
    }

    // 2. Post-process: Render Charts
    const chartPlaceholders = preview.querySelectorAll('.chart-placeholder');
    chartPlaceholders.forEach((el, index) => {
        try {
            const configStr = decodeURIComponent(el.getAttribute('data-config'));

            // Use Function constructor to allow relaxed JSON (e.g. comments, trailing commas)
            // Wrap in parentheses to ensure it's treated as an expression
            const config = new Function('return (' + configStr + ')')();

            const canvasContainer = document.createElement('div');
            canvasContainer.className = 'chart-container';
            const canvas = document.createElement('canvas');
            canvas.id = `chart-${index}`;
            canvasContainer.appendChild(canvas);

            el.replaceWith(canvasContainer);

            if (typeof Chart !== 'undefined') {
                new Chart(canvas, config);
            } else {
                canvasContainer.innerHTML = '<p style="color:red">Chart.js library not loaded.</p>';
            }
        } catch (e) {
            console.error("Chart rendering error:", e);
            el.innerHTML = `<pre style="color:red; background:#ffebee; padding:10px;">Error rendering chart:\n${e.message}</pre>`;
        }
    });

    // 3. Post-process: Render Mermaid
    // Mermaid looks for .mermaid class. We need to tell it to run on the new content.
    mermaid.run({
        nodes: preview.querySelectorAll('.mermaid')
    });

    // 4. Post-process: Render Desmos
    const desmosPlaceholders = preview.querySelectorAll('.desmos-placeholder');
    desmosPlaceholders.forEach((el, index) => {
        try {
            const content = decodeURIComponent(el.getAttribute('data-content'));
            let lines = content.split('\n');

            // Parse config
            let config = {};
            let expressions = [];

            const fullText = lines.join('\n');

            // Check for state comment first (generated by tool)
            const stateStartMarker = '//state:';
            const stateStartIndex = fullText.indexOf(stateStartMarker);
            let state = null;

            if (stateStartIndex !== -1) {
                const jsonStr = fullText.substring(stateStartIndex + stateStartMarker.length);
                try {
                    state = JSON.parse(jsonStr);
                } catch (e) {
                    console.error("Invalid Desmos state JSON", e);
                }
            }

            // Check for config comment (manual editing)
            // Looking for //config: {...}
            const configStartMarker = '//config:';
            const configStartIndex = fullText.indexOf(configStartMarker);

            if (configStartIndex !== -1) {
                let braceCount = 0;
                let jsonStartIndex = -1;
                let jsonEndIndex = -1;

                // Find start of JSON
                for (let i = configStartIndex + configStartMarker.length; i < fullText.length; i++) {
                    if (fullText[i] === '{') {
                        jsonStartIndex = i;
                        braceCount = 1;
                        break;
                    }
                }

                if (jsonStartIndex !== -1) {
                    // Find end of JSON
                    for (let i = jsonStartIndex + 1; i < fullText.length; i++) {
                        if (fullText[i] === '{') braceCount++;
                        if (fullText[i] === '}') braceCount--;

                        if (braceCount === 0) {
                            jsonEndIndex = i + 1;
                            break;
                        }
                    }
                }

                if (jsonEndIndex !== -1) {
                    const jsonStr = fullText.substring(jsonStartIndex, jsonEndIndex);
                    try {
                        config = JSON.parse(jsonStr);
                        // Remove the config block from the text to process expressions
                        const beforeConfig = fullText.substring(0, configStartIndex);
                        const afterConfig = fullText.substring(jsonEndIndex);
                        const remainingText = beforeConfig + afterConfig;
                        lines = remainingText.split('\n');

                    } catch (e) {
                        console.error("Invalid Desmos config JSON", e);
                    }
                }
            }

            const container = document.createElement('div');
            container.className = 'desmos-container';
            container.id = `desmos-${index}`;
            el.replaceWith(container);

            if (typeof Desmos !== 'undefined') {
                const calculator = Desmos.GraphingCalculator(container, {
                    keypad: false,
                    expressions: config.expressions !== undefined ? config.expressions : (!state),
                    settingsMenu: false,
                    ...config
                });

                if (state) {
                    calculator.setState(state);
                } else {
                    // Set bounds if provided
                    if (config.bounds) {
                        calculator.setMathBounds({
                            left: config.bounds.x[0],
                            right: config.bounds.x[1],
                            bottom: config.bounds.y[0],
                            top: config.bounds.y[1]
                        });
                    }

                    // Add expressions
                    let exprIndex = 0;
                    lines.forEach(line => {
                        const trimmed = line.trim();
                        if (!trimmed || trimmed.startsWith('//')) return;
                        calculator.setExpression({ id: `expr-${exprIndex++}`, latex: trimmed });
                    });
                }
            } else {
                container.innerHTML = '<p style="color:red">Desmos API not loaded.</p>';
            }

        } catch (e) {
            el.innerHTML = `<p style="color:red">Error rendering Desmos: ${e.message}</p>`;
        }
    });

    // 5. Post-process: Render Math (KaTeX)
    renderMathInElement(preview, {
        delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '$', right: '$', display: false }
        ],
        throwOnError: false
    });

    setupInteractivity();
}

// Event Listeners
cmEditor.on('change', debounce(render, 500));

// Initial Render
render();


// Templates
const templates = {
    barChart: `\`\`\`chart
{
    "type": "bar",
    "data": {
        "labels": ["Jan", "Feb", "Mar"],
        "datasets": [{
            "label": "Sales",
            "data": [10, 20, 30],
            "backgroundColor": ["rgba(255, 99, 132, 0.2)", "rgba(54, 162, 235, 0.2)", "rgba(255, 206, 86, 0.2)"]
        }]
    }
}
\`\`\``,
    lineChart: `\`\`\`chart
{
    "type": "line",
    "data": {
        "labels": ["Week 1", "Week 2", "Week 3"],
        "datasets": [{
            "label": "Progress",
            "data": [10, 25, 45],
            "borderColor": "rgb(75, 192, 192)",
            "tension": 0.1
        }]
    }
}
\`\`\``,
    pieChart: `\`\`\`chart
{
    "type": "pie",
    "data": {
        "labels": ["Red", "Blue", "Yellow"],
        "datasets": [{
            "data": [300, 50, 100],
            "backgroundColor": ["rgb(255, 99, 132)", "rgb(54, 162, 235)", "rgb(255, 205, 86)"]
        }]
    }
}
\`\`\``,
    doughnutChart: `\`\`\`chart
{
    "type": "doughnut",
    "data": {
        "labels": ["A", "B", "C"],
        "datasets": [{
            "data": [30, 20, 25],
            "backgroundColor": ["rgb(255, 99, 132)", "rgb(54, 162, 235)", "rgb(255, 205, 86)"]
        }]
    }
}
\`\`\``,
    flowchart: `\`\`\`mermaid
graph TD
    A[Start] --> B{Is it working?}
    B -->|Yes| C[Great!]
    B -->|No| D[Debug]
    D --> B
\`\`\``,
    sequence: `\`\`\`mermaid
sequenceDiagram
    Alice->>John: Hello John, how are you?
    John-->>Alice: Great!
\`\`\``,
    classDiagram: `\`\`\`mermaid
classDiagram
    class Animal {
        +String name
        +void eat()
    }
    class Duck {
        +void quack()
    }
    Animal <|-- Duck
\`\`\``,
    stateDiagram: `\`\`\`mermaid
stateDiagram-v2
    [*] --> Still
    Still --> [*]
    Still --> Moving
    Moving --> Still
    Moving --> Crash
    Crash --> [*]
\`\`\``,
    gantt: `\`\`\`mermaid
gantt
    title A Gantt Diagram
    dateFormat  YYYY-MM-DD
    section Section
    A task           :a1, 2014-01-01, 30d
    Another task     :after a1  , 20d
\`\`\``,
    erDiagram: `\`\`\`mermaid
erDiagram
    CUSTOMER ||--o{ ORDER : places
    ORDER ||--|{ LINE-ITEM : contains
    CUSTOMER }|..|{ DELIVERY-ADDRESS : uses
\`\`\``,
    journey: `\`\`\`mermaid
journey
    title My working day
    section Go to work
      Make tea: 5: Me
      Go upstairs: 3: Me
      Do work: 1: Me, Cat
    section Go home
      Go downstairs: 5: Me
      Sit down: 5: Me
\`\`\``,
    inlineMath: `$E = mc^2$`,
    displayMath: `$$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$`,
    desmos: `\`\`\`desmos
//config: {
  "bounds": {"x": [-10, 10], "y": [-10, 10]},
  "grid": true
}
y=x^2
y=sin(x)
\`\`\``,
    markscheme: `<details>
<summary>Markscheme</summary>

---

Answer: 42

</details>`
};

// Templates Data
const templateCategories = {
    charts: [
        { id: 'barChart', label: 'Bar Chart', code: templates.barChart },
        { id: 'lineChart', label: 'Line Chart', code: templates.lineChart },
        { id: 'pieChart', label: 'Pie Chart', code: templates.pieChart },
        { id: 'doughnutChart', label: 'Doughnut Chart', code: templates.doughnutChart }
    ],
    mermaid: [
        { id: 'flowchart', label: 'Flowchart', code: templates.flowchart },
        { id: 'sequence', label: 'Sequence Diagram', code: templates.sequence },
        { id: 'classDiagram', label: 'Class Diagram', code: templates.classDiagram },
        { id: 'stateDiagram', label: 'State Diagram', code: templates.stateDiagram },
        { id: 'gantt', label: 'Gantt Chart', code: templates.gantt },
        { id: 'erDiagram', label: 'ER Diagram', code: templates.erDiagram },
        { id: 'journey', label: 'User Journey', code: templates.journey }
    ],
    math: [
        { id: 'inlineMath', label: 'Inline Math', code: templates.inlineMath },
        { id: 'displayMath', label: 'Display Math', code: templates.displayMath },
        { id: 'desmos', label: 'Desmos Graph', code: templates.desmos }
    ],
    chemistry: [
        { id: 'chemEq', label: 'Chemical Equation', code: '$\\ce{H2O}$' },
        { id: 'chemReaction', label: 'Reaction', code: '$\\ce{A + B -> C}$' },
        { id: 'chemIsotope', label: 'Isotope', code: '$\\ce{^{227}_{90}Th+}$' }
    ],
    formulas: [
        // Math - Algebra
        { id: 'quadratic', label: 'Quadratic Formula', code: '$$x = \\frac{-b \\pm \\sqrt{b^2-4ac}}{2a}$$', subject: 'Math' },
        { id: 'log_change_base', label: 'Log Change of Base', code: '$$\\log_a x = \\frac{\\log_b x}{\\log_b a}$$', subject: 'Math' },
        { id: 'binomial', label: 'Binomial Theorem', code: '$$(a+b)^n = \\sum_{r=0}^n \\binom{n}{r} a^{n-r} b^r$$', subject: 'Math' },

        // Math - Functions
        { id: 'arithmetic_sum', label: 'Arithmetic Series Sum', code: '$$S_n = \\frac{n}{2}(2u_1 + (n-1)d)$$', subject: 'Math' },
        { id: 'geometric_sum', label: 'Geometric Series Sum', code: '$$S_n = \\frac{u_1(r^n - 1)}{r - 1}$$', subject: 'Math' },
        { id: 'compound_interest', label: 'Compound Interest', code: '$$FV = PV \\times (1 + \\frac{r}{100k})^{kn}$$', subject: 'Math' },

        // Math - Geometry & Trig
        { id: 'dist_formula', label: 'Distance Formula', code: '$$d = \\sqrt{(x_2-x_1)^2 + (y_2-y_1)^2}$$', subject: 'Math' },
        { id: 'midpoint', label: 'Midpoint Formula', code: '$$M = (\\frac{x_1+x_2}{2}, \\frac{y_1+y_2}{2})$$', subject: 'Math' },
        { id: 'sine_rule', label: 'Sine Rule', code: '$$\\frac{a}{\\sin A} = \\frac{b}{\\sin B} = \\frac{c}{\\sin C}$$', subject: 'Math' },
        { id: 'cosine_rule', label: 'Cosine Rule', code: '$$c^2 = a^2 + b^2 - 2ab \\cos C$$', subject: 'Math' },
        { id: 'area_triangle', label: 'Area of Triangle', code: '$$A = \\frac{1}{2}ab \\sin C$$', subject: 'Math' },
        { id: 'arc_length', label: 'Arc Length', code: '$$l = \\theta r$$', subject: 'Math' },
        { id: 'sector_area', label: 'Sector Area', code: '$$A = \\frac{1}{2} \\theta r^2$$', subject: 'Math' },

        // Math - Calculus
        { id: 'derivative_def', label: 'Derivative Definition', code: '$$f\'(x) = \\lim_{h \\to 0} \\frac{f(x+h) - f(x)}{h}$$', subject: 'Math' },
        { id: 'chain_rule', label: 'Chain Rule', code: '$$y = g(u), u = f(x) \\Rightarrow \\frac{dy}{dx} = \\frac{dy}{du} \\times \\frac{du}{dx}$$', subject: 'Math' },
        { id: 'product_rule', label: 'Product Rule', code: '$$y = uv \\Rightarrow \\frac{dy}{dx} = u\\frac{dv}{dx} + v\\frac{du}{dx}$$', subject: 'Math' },
        { id: 'quotient_rule', label: 'Quotient Rule', code: '$$y = \\frac{u}{v} \\Rightarrow \\frac{dy}{dx} = \\frac{v\\frac{du}{dx} - u\\frac{dv}{dx}}{v^2}$$', subject: 'Math' },
        { id: 'integration_parts', label: 'Integration by Parts', code: '$$\\int u \\frac{dv}{dx} dx = uv - \\int v \\frac{du}{dx} dx$$', subject: 'Math' },

        // Math - Stats
        { id: 'mean', label: 'Mean', code: '$$\\bar{x} = \\frac{\\sum_{i=1}^k f_i x_i}{n}$$', subject: 'Math' },
        { id: 'probability', label: 'Probability', code: '$$P(A) = \\frac{n(A)}{n(U)}$$', subject: 'Math' },
        { id: 'conditional_prob', label: 'Conditional Probability', code: '$$P(A|B) = \\frac{P(A \\cap B)}{P(B)}$$', subject: 'Math' },

        // Physics - Mechanics
        { id: 'suvat_v', label: 'Kinematics (v)', code: '$$v = u + at$$', subject: 'Physics' },
        { id: 'suvat_s', label: 'Kinematics (s)', code: '$$s = ut + \\frac{1}{2}at^2$$', subject: 'Physics' },
        { id: 'suvat_v2', label: 'Kinematics (v²)', code: '$$v^2 = u^2 + 2as$$', subject: 'Physics' },
        { id: 'force', label: 'Force', code: '$$F = ma$$', subject: 'Physics' },
        { id: 'friction', label: 'Friction', code: '$$F_f \\leq \\mu_s R$$', subject: 'Physics' },
        { id: 'work', label: 'Work', code: '$$W = Fs \\cos \\theta$$', subject: 'Physics' },
        { id: 'ke', label: 'Kinetic Energy', code: '$$E_k = \\frac{1}{2}mv^2$$', subject: 'Physics' },
        { id: 'gpe', label: 'Potential Energy', code: '$$E_p = mg\\Delta h$$', subject: 'Physics' },
        { id: 'power', label: 'Power', code: '$$P = Fv$$', subject: 'Physics' },
        { id: 'momentum', label: 'Momentum', code: '$$p = mv$$', subject: 'Physics' },

        // Physics - Thermal
        { id: 'heat_capacity', label: 'Heat Capacity', code: '$$Q = mc\\Delta T$$', subject: 'Physics' },
        { id: 'latent_heat', label: 'Latent Heat', code: '$$Q = mL$$', subject: 'Physics' },
        { id: 'ideal_gas', label: 'Ideal Gas Law', code: '$$pV = nRT$$', subject: 'Physics' },

        // Physics - Waves
        { id: 'wave_speed', label: 'Wave Speed', code: '$$c = f\\lambda$$', subject: 'Physics' },
        { id: 'refractive_index', label: 'Refractive Index', code: '$$n = \\frac{c}{v}$$', subject: 'Physics' },
        { id: 'snells_law', label: 'Snell\'s Law', code: '$$\\frac{n_1}{n_2} = \\frac{\\sin \\theta_2}{\\sin \\theta_1} = \\frac{v_2}{v_1}$$', subject: 'Physics' },
        { id: 'double_slit', label: 'Double Slit', code: '$$s = \\frac{\\lambda D}{d}$$', subject: 'Physics' },

        // Physics - Electricity
        { id: 'coulombs_law', label: 'Coulomb\'s Law', code: '$$F = k \\frac{q_1 q_2}{r^2}$$', subject: 'Physics' },
        { id: 'electric_field', label: 'Electric Field', code: '$$E = \\frac{F}{q}$$', subject: 'Physics' },
        { id: 'current', label: 'Current', code: '$$I = \\frac{\\Delta q}{\\Delta t}$$', subject: 'Physics' },
        { id: 'ohms_law', label: 'Ohm\'s Law', code: '$$V = IR$$', subject: 'Physics' },
        { id: 'resistivity', label: 'Resistivity', code: '$$R = \\rho \\frac{L}{A}$$', subject: 'Physics' },
        { id: 'power_elec', label: 'Electric Power', code: '$$P = VI = I^2R = \\frac{V^2}{R}$$', subject: 'Physics' },

        // Chemistry - Stoichiometry
        { id: 'moles_mass', label: 'Moles (Mass)', code: '$$n = \\frac{m}{M}$$', subject: 'Chemistry' },
        { id: 'moles_vol', label: 'Moles (Gas Vol)', code: '$$n = \\frac{V}{V_{m}}$$', subject: 'Chemistry' },
        { id: 'concentration', label: 'Concentration', code: '$$c = \\frac{n}{V}$$', subject: 'Chemistry' },
        { id: 'ideal_gas_chem', label: 'Ideal Gas Law', code: '$$PV = nRT$$', subject: 'Chemistry' },
        { id: 'percent_yield', label: 'Percent Yield', code: '$$\\% \\text{ yield} = \\frac{\\text{experimental yield}}{\\text{theoretical yield}} \\times 100$$', subject: 'Chemistry' },

        // Chemistry - Energetics
        { id: 'enthalpy', label: 'Heat Change', code: '$$q = mc\\Delta T$$', subject: 'Chemistry' },
        { id: 'gibbs', label: 'Gibbs Free Energy', code: '$$\\Delta G = \\Delta H - T\\Delta S$$', subject: 'Chemistry' },

        // Chemistry - Equilibrium
        { id: 'kc', label: 'Equilibrium Constant', code: '$$K_c = \\frac{[C]^c [D]^d}{[A]^a [B]^b}$$', subject: 'Chemistry' },
        { id: 'ph', label: 'pH', code: '$$\\text{pH} = -\\log[H^+]$$', subject: 'Chemistry' },
        { id: 'kw', label: 'Ionic Product', code: '$$K_w = [H^+][OH^-] = 1.0 \\times 10^{-14}$$', subject: 'Chemistry' },

        // Biology
        { id: 'magnification', label: 'Magnification', code: '$$M = \\frac{I}{A}$$', subject: 'Biology' },
        { id: 'bmi', label: 'BMI', code: '$$\\text{BMI} = \\frac{\\text{mass (kg)}}{\\text{height (m)}^2}$$', subject: 'Biology' },
        { id: 'simpsons_index', label: 'Simpson\'s Diversity Index', code: '$$D = \\frac{N(N-1)}{\\sum n(n-1)}$$', subject: 'Biology' },
        { id: 'lincoln_index', label: 'Lincoln Index', code: '$$N = \\frac{n_1 \\times n_2}{m_2}$$', subject: 'Biology' },
        { id: 'rq', label: 'Respiratory Quotient', code: '$$RQ = \\frac{\\text{CO}_2 \\text{ produced}}{\\text{O}_2 \\text{ consumed}}$$', subject: 'Biology' },
        { id: 'chi_squared', label: 'Chi-Squared', code: '$$\\chi^2 = \\sum \\frac{(O - E)^2}{E}$$', subject: 'Biology' },

        // Economics
        { id: 'ped', label: 'PED', code: '$$\\text{PED} = \\frac{\\% \\Delta Q_d}{\\% \\Delta P}$$', subject: 'Economics' },
        { id: 'xed', label: 'XED', code: '$$\\text{XED} = \\frac{\\% \\Delta Q_d \\text{ of A}}{\\% \\Delta P \\text{ of B}}$$', subject: 'Economics' },
        { id: 'yed', label: 'YED', code: '$$\\text{YED} = \\frac{\\% \\Delta Q_d}{\\% \\Delta Y}$$', subject: 'Economics' },
        { id: 'pes', label: 'PES', code: '$$\\text{PES} = \\frac{\\% \\Delta Q_s}{\\% \\Delta P}$$', subject: 'Economics' },
        { id: 'gdp_exp', label: 'GDP (Expenditure)', code: '$$GDP = C + I + G + (X - M)$$', subject: 'Economics' },
        { id: 'multiplier', label: 'Keynesian Multiplier', code: '$$k = \\frac{1}{1 - MPC} = \\frac{1}{MPW}$$', subject: 'Economics' },
        { id: 'inflation', label: 'Inflation Rate', code: '$$\\text{Inflation} = \\frac{\\text{CPI}_2 - \\text{CPI}_1}{\\text{CPI}_1} \\times 100$$', subject: 'Economics' },

        // Business
        { id: 'break_even', label: 'Break-even Point', code: '$$BEP = \\frac{\\text{Fixed Costs}}{\\text{Price} - \\text{Variable Cost per Unit}}$$', subject: 'Business' },
        { id: 'gross_profit_margin', label: 'Gross Profit Margin', code: '$$GPM = \\frac{\\text{Gross Profit}}{\\text{Sales Revenue}} \\times 100$$', subject: 'Business' },
        { id: 'net_profit_margin', label: 'Net Profit Margin', code: '$$NPM = \\frac{\\text{Net Profit}}{\\text{Sales Revenue}} \\times 100$$', subject: 'Business' },
        { id: 'roce', label: 'ROCE', code: '$$ROCE = \\frac{\\text{Net Profit before Interest \\& Tax}}{\\text{Capital Employed}} \\times 100$$', subject: 'Business' },
        { id: 'current_ratio', label: 'Current Ratio', code: '$$\\text{Current Ratio} = \\frac{\\text{Current Assets}}{\\text{Current Liabilities}}$$', subject: 'Business' },
        { id: 'acid_test', label: 'Acid Test Ratio', code: '$$\\text{Acid Test} = \\frac{\\text{Current Assets} - \\text{Stock}}{\\text{Current Liabilities}}$$', subject: 'Business' },
        { id: 'market_share', label: 'Market Share', code: '$$\\text{Market Share} = \\frac{\\text{Firm\'s Sales}}{\\text{Total Market Sales}} \\times 100$$', subject: 'Business' },
        { id: 'capacity_util', label: 'Capacity Utilization', code: '$$\\text{Utilization} = \\frac{\\text{Actual Output}}{\\text{Productive Capacity}} \\times 100$$', subject: 'Business' }
    ],
    misc: [
        { id: 'markscheme', label: 'Markscheme', code: templates.markscheme }
    ]
};

// Template Modal Logic
const templateModal = document.getElementById('template-modal');
const templateGrid = document.getElementById('template-grid');
const templateModalTitle = document.getElementById('template-modal-title');

function openTemplateModal(category) {
    templateModal.style.display = 'block';

    if (category === 'misc') {
        templateModalTitle.textContent = 'Insert Markscheme';
    } else {
        templateModalTitle.textContent = `Insert ${category.charAt(0).toUpperCase() + category.slice(1)}`;
    }

    // Start Feature Tours
    if (category === 'mermaid') {
        setTimeout(() => startFeatureTour('mermaid'), 500);
    } else if (category === 'charts') {
        setTimeout(() => startFeatureTour('charts'), 500);
    }

    const controls = document.getElementById('template-controls');
    const searchInput = document.getElementById('template-search');
    const filtersContainer = document.getElementById('template-filters');

    // Reset controls
    if (searchInput) searchInput.value = '';

    if (category === 'formulas' && controls) {
        controls.style.display = 'block';

        // Setup Filters
        filtersContainer.innerHTML = '';
        const subjects = ['All', 'Math', 'Physics', 'Chemistry', 'Biology', 'Economics', 'Business'];

        subjects.forEach(subject => {
            const btn = document.createElement('button');
            btn.className = 'tab-btn' + (subject === 'All' ? ' active' : '');
            btn.textContent = subject;
            btn.onclick = () => {
                // Update active state
                filtersContainer.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                filterTemplates(category);
            };
            filtersContainer.appendChild(btn);
        });

        // Setup Search
        searchInput.oninput = () => filterTemplates(category);

    } else if (controls) {
        controls.style.display = 'none';
    }

    const items = templateCategories[category];
    if (!items) return;

    renderTemplateGrid(items, category);
}

function filterTemplates(category) {
    const searchInput = document.getElementById('template-search');
    const filtersContainer = document.getElementById('template-filters');

    const searchTerm = searchInput.value.toLowerCase();
    const activeFilter = filtersContainer.querySelector('.active').textContent;

    const allItems = templateCategories[category];

    const filteredItems = allItems.filter(item => {
        const matchesSearch = item.label.toLowerCase().includes(searchTerm) || (item.code && item.code.toLowerCase().includes(searchTerm));
        const matchesFilter = activeFilter === 'All' || item.subject === activeFilter;
        return matchesSearch && matchesFilter;
    });

    renderTemplateGrid(filteredItems, category);
}

function renderTemplateGrid(items, category) {
    templateGrid.innerHTML = ''; // Clear previous

    if (items.length === 0) {
        templateGrid.innerHTML = '<p style="grid-column: 1/-1; text-align: center; color: #888;">No formulas found.</p>';
        return;
    }

    items.forEach(item => {
        const card = document.createElement('div');
        card.className = 'template-card';
        card.onclick = () => {
            if (category === 'formulas') {
                insertTemplateCode(item.code);
            } else if (item.id === 'inlineMath' || item.id === 'displayMath' || category === 'chemistry') {
                openMathBuilder(item.id, item.code);
            } else {
                insertTemplateCode(item.code);
            }
            closeTemplateModal();
        };

        const preview = document.createElement('div');
        preview.className = 'template-preview';
        preview.id = `preview-${item.id}`;

        const title = document.createElement('div');
        title.className = 'template-title';
        title.textContent = item.label;

        card.appendChild(preview);
        card.appendChild(title);
        templateGrid.appendChild(card);

        // Render Preview
        setTimeout(() => renderPreview(item, preview), 0);
    });
}

function closeTemplateModal() {
    templateModal.style.display = 'none';
}

function insertTemplate(key) {
    if (templates[key]) {
        insertTemplateCode(templates[key]);
    }
    if (contextMenu) contextMenu.style.display = 'none';
}

function applyTheme(theme) {
    document.body.className = ''; // Reset
    let cmTheme = 'dracula';

    switch (theme) {
        case 'light':
            document.body.classList.add('theme-light');
            cmTheme = 'eclipse';
            break;
        case 'monokai':
            document.body.classList.add('theme-monokai');
            cmTheme = 'monokai';
            break;
        case 'solarized-dark':
            document.body.classList.add('theme-solarized-dark');
            cmTheme = 'solarized dark';
            break;
        case 'solarized-light':
            document.body.classList.add('theme-solarized-light');
            cmTheme = 'solarized light';
            break;
        case 'high-contrast':
            document.body.classList.add('theme-high-contrast');
            cmTheme = 'neo';
            break;
        case 'github-light':
            document.body.classList.add('theme-github-light');
            cmTheme = 'github';
            break;
        case 'github-light-hc':
            document.body.classList.add('theme-github-light-hc');
            cmTheme = 'github';
            break;
        case 'github-dark':
            document.body.classList.add('theme-github-dark');
            cmTheme = 'dracula';
            break;
        case 'github-dark-dimmed':
            document.body.classList.add('theme-github-dark-dimmed');
            cmTheme = 'nord';
            break;
        case 'github-dark-hc':
            document.body.classList.add('theme-github-dark-hc');
            cmTheme = 'dracula';
            break;
        default: // dark
            cmTheme = 'dracula';
            break;
    }

    if (cmEditor) cmEditor.setOption('theme', cmTheme);
    localStorage.setItem('ivy_theme', theme);
}

function insertTemplateCode(code) {
    const doc = cmEditor.getDoc();
    const cursor = doc.getCursor();
    const line = doc.getLine(cursor.line);

    // Add newlines if not on an empty line
    const textToInsert = (line.length > 0 ? '\n\n' : '') + code + '\n\n';

    doc.replaceRange(textToInsert, cursor);

    render();
    cmEditor.focus();
}

function renderPreview(item, container) {
    // Extract code content (remove markdown fences)
    let code = item.code;
    let type = '';

    if (code.startsWith('```chart')) {
        type = 'chart';
        code = code.replace(/```chart\n|```/g, '');
    } else if (code.startsWith('```mermaid')) {
        type = 'mermaid';
        code = code.replace(/```mermaid\n|```/g, '');
    } else if (code.startsWith('```desmos')) {
        type = 'desmos';
        // Desmos preview is hard to render multiple instances efficiently in this simple setup
        // We'll show a placeholder icon or text
        container.innerHTML = '<span class="material-icons" style="font-size: 48px; color: #ccc;">functions</span>';
        return;
    } else if (code.startsWith('$')) {
        type = 'math';
        // Keep the $ for katex
    } else {
        // Misc or others
        container.innerHTML = '<span class="material-icons" style="font-size: 48px; color: #ccc;">description</span>';
        return;
    }

    try {
        if (type === 'chart') {
            const canvas = document.createElement('canvas');
            container.appendChild(canvas);
            // Use Function constructor for relaxed JSON
            const config = new Function('return (' + code + ')')();
            // Disable animation for previews
            if (config.options) {
                config.options.animation = false;
                config.options.responsive = true;
                config.options.maintainAspectRatio = false;
            } else {
                config.options = { animation: false, responsive: true, maintainAspectRatio: false };
            }
            new Chart(canvas, config);
        } else if (type === 'mermaid') {
            // Mermaid render
            // We need a unique ID
            const id = 'mermaid-' + Math.random().toString(36).substr(2, 9);
            container.innerHTML = `<div class="mermaid" id="${id}">${code}</div>`;
            mermaid.run({ nodes: [container.querySelector('.mermaid')] });
        } else if (type === 'math') {
            // KaTeX
            const mathCode = code.replace(/\$\$/g, '').replace(/\$/g, '');
            const isDisplay = code.startsWith('$$');
            katex.render(mathCode, container, {
                throwOnError: false,
                displayMode: isDisplay
            });
        }
    } catch (e) {
        console.error("Preview render error", e);
        container.innerHTML = '<span style="color:red; font-size:12px">Preview Error</span>';
    }
}

// Text Formatting
function formatText(type) {
    const doc = cmEditor.getDoc();
    const selection = doc.getSelection();
    const cursor = doc.getCursor();
    let replacement = '';
    let cursorOffset = 0; // Not strictly needed with CodeMirror's setSelection but good for logic

    switch (type) {
        case 'bold':
            replacement = `**${selection || 'Bold Text'}**`;
            break;
        case 'italic':
            replacement = `*${selection || 'Italic Text'}*`;
            break;
        case 'strikethrough':
            replacement = `~~${selection || 'Strikethrough Text'}~~`;
            break;
        case 'h1':
            replacement = `# ${selection || 'Heading 1'}`;
            break;
        case 'h2':
            replacement = `## ${selection || 'Heading 2'}`;
            break;
        case 'h3':
            replacement = `### ${selection || 'Heading 3'}`;
            break;
        case 'ul':
            replacement = `- ${selection || 'List Item'}`;
            break;
        case 'ol':
            replacement = `1. ${selection || 'List Item'}`;
            break;
        case 'task':
            replacement = `- [ ] ${selection || 'Task Item'}`;
            break;
        case 'quote':
            replacement = `> ${selection || 'Quote'}`;
            break;
        case 'code':
            if (selection.includes('\n')) {
                replacement = `\`\`\`\n${selection}\n\`\`\``;
            } else {
                replacement = `\`${selection || 'code'}\``;
            }
            break;
        case 'link':
            replacement = `[${selection || 'Link Text'}](url)`;
            break;
        case 'image':
            replacement = `![${selection || 'Alt Text'}](image-url)`;
            break;
        case 'table':
            // Handled by modal now, but keep basic fallback or remove
            openTableModal();
            return;
    }

    doc.replaceSelection(replacement);

    // If no selection was made, we might want to select the placeholder text
    // This is a bit more complex with CodeMirror but basic replacement works fine.

    render();
    cmEditor.focus();
}

// Table Modal Logic
const tableModal = document.getElementById('table-modal');

// Table Grid Logic
const tableGridSelector = document.getElementById('table-grid-selector');
const tableGridLabel = document.getElementById('table-grid-label');
let selectedRows = 1;
let selectedCols = 1;

function initTableGrid() {
    tableGridSelector.innerHTML = '';
    for (let r = 1; r <= 10; r++) {
        for (let c = 1; c <= 10; c++) {
            const cell = document.createElement('div');
            cell.className = 'grid-cell';
            cell.dataset.row = r;
            cell.dataset.col = c;

            cell.addEventListener('mouseover', () => highlightGrid(r, c));
            cell.addEventListener('click', () => insertGridTable(r, c));

            tableGridSelector.appendChild(cell);
        }
    }
}

function highlightGrid(rows, cols) {
    selectedRows = rows;
    selectedCols = cols;
    tableGridLabel.textContent = `${rows} x ${cols}`;

    const cells = tableGridSelector.children;
    for (let cell of cells) {
        const r = parseInt(cell.dataset.row);
        const c = parseInt(cell.dataset.col);
        if (r <= rows && c <= cols) {
            cell.classList.add('active');
        } else {
            cell.classList.remove('active');
        }
    }
}

function insertGridTable(rows, cols) {
    let tableMD = '\n';
    // Header
    tableMD += '| ' + Array(cols).fill('Header').join(' | ') + ' |\n';
    // Separator
    tableMD += '| ' + Array(cols).fill('---').join(' | ') + ' |\n';
    // Rows
    for (let i = 0; i < rows; i++) {
        tableMD += '| ' + Array(cols).fill('Cell').join(' | ') + ' |\n';
    }
    tableMD += '\n';

    const doc = cmEditor.getDoc();
    const cursor = doc.getCursor();
    doc.replaceRange(tableMD, cursor);

    closeTableModal();
    render();
    cmEditor.focus();
}

function closeTableModal() {
    document.getElementById('table-modal').style.display = 'none';
}

// Override openTableModal to init grid
const originalOpenTableModal = window.openTableModal; // If it existed globally
// We'll just redefine it since we replaced the HTML
function openTableModal() {
    document.getElementById('table-modal').style.display = 'block';
    initTableGrid();
    highlightGrid(1, 1);
}

// Math Builder Logic
const mathModal = document.getElementById('math-modal');
const mathInput = document.getElementById('math-input');
const mathPreview = document.getElementById('math-preview');
const mathSymbolsGrid = document.getElementById('math-symbols-grid');
const mathBlockCheck = document.getElementById('math-block-check');
const mathChemCheck = document.getElementById('math-chem-check');
const periodicTableContainer = document.getElementById('periodic-table-container');
const periodicTableGrid = document.getElementById('periodic-table-grid');
let currentMathMode = 'inline'; // inline or display
let isChemMode = false;

const mathSymbols = {
    common: [
        { label: '+', code: '+' }, { label: '-', code: '-' }, { label: '=', code: '=' },
        { label: '×', code: '\\times' }, { label: '÷', code: '\\div' },
        { label: '±', code: '\\pm' }, { label: 'mp', code: '\\mp' },
        { label: 'dot', code: '\\cdot' }, { label: 'ast', code: '\\ast' },
        { label: '≠', code: '\\neq' }, { label: '≈', code: '\\approx' },
        { label: '≤', code: '\\leq' }, { label: '≥', code: '\\geq' },
        { label: 'π', code: '\\pi' }, { label: 'θ', code: '\\theta' },
        { label: '\\sqrt{}', code: '\\sqrt{}', display: '\\sqrt{\\Box}' },
        { label: 'root', code: '\\sqrt[n]{x}', display: '\\sqrt[n]{x}' },
        { label: 'x²', code: '^2', display: 'x^2' }, { label: 'x^n', code: '^{n}', display: 'x^n' },
        { label: 'x_n', code: '_{n}', display: 'x_n' },
        { label: 'frac', code: '\\frac{a}{b}', display: '\\frac{a}{b}' },
        { label: '°', code: '^\\circ' }, { label: '∠', code: '\\angle' },
        { label: 'MEAS', code: '\\measuredangle' },
        { label: '△', code: '\\triangle' }, { label: 'Box', code: '\\Box' },
        { label: '∀', code: '\\forall' }, { label: '∃', code: '\\exists' },
        { label: 'nexists', code: '\\nexists' },
        { label: 'therefore', code: '\\therefore' }, { label: 'because', code: '\\because' },
        { label: 'infty', code: '\\infty' }, { label: 'empty', code: '\\emptyset' },
        { label: 'neg', code: '\\neg' }, { label: 'top', code: '\\top' }, { label: 'bot', code: '\\bot' },
        { label: 'cup', code: '\\cup' }, { label: 'cap', code: '\\cap' }
    ],
    calculus: [
        { label: 'd/dx', code: '\\frac{d}{dx}', display: '\\frac{d}{dx}' },
        { label: 'd²/dx²', code: '\\frac{d^2}{dx^2}', display: '\\frac{d^2}{dx^2}' },
        { label: '∂/∂x', code: '\\frac{\\partial}{\\partial x}', display: '\\frac{\\partial}{\\partial x}' },
        { label: 'grad', code: '\\nabla' },
        { label: 'Δx', code: '\\Delta x' }, { label: 'δ', code: '\\delta' },
        { label: '∫', code: '\\int' }, { label: '∫ab', code: '\\int_{a}^{b}', display: '\\int_{a}^{b}' },
        { label: '∬', code: '\\iint' }, { label: '∭', code: '\\iiint' },
        { label: '∮', code: '\\oint' }, { label: 'oiint', code: '\\oiint' },
        { label: 'lim', code: '\\lim_{x \\to 0}', display: '\\lim_{x \\to 0}' },
        { label: 'sum', code: '\\sum_{i=1}^{n}', display: '\\sum_{i=1}^{n}' },
        { label: 'prod', code: '\\prod_{i=1}^{n}', display: '\\prod_{i=1}^{n}' },
        { label: 'f\'', code: 'f\'(x)', display: 'f\'(x)' },
        { label: 'dot', code: '\\dot{x}' }, { label: 'ddot', code: '\\ddot{x}' },
        { label: 'prime', code: '\\prime' },
        { label: 'Delta', code: '\\Delta' }
    ],
    greek: [
        { label: 'α', code: '\\alpha' }, { label: 'β', code: '\\beta' }, { label: 'γ', code: '\\gamma' },
        { label: 'δ', code: '\\delta' }, { label: 'ε', code: '\\epsilon' }, { label: 'ζ', code: '\\zeta' },
        { label: 'η', code: '\\eta' }, { label: 'θ', code: '\\theta' }, { label: 'ι', code: '\\iota' },
        { label: 'κ', code: '\\kappa' }, { label: 'λ', code: '\\lambda' }, { label: 'μ', code: '\\mu' },
        { label: 'ν', code: '\\nu' }, { label: 'ξ', code: '\\xi' }, { label: 'π', code: '\\pi' },
        { label: 'ρ', code: '\\rho' }, { label: 'σ', code: '\\sigma' }, { label: 'τ', code: '\\tau' },
        { label: 'υ', code: '\\upsilon' }, { label: 'φ', code: '\\phi' }, { label: 'χ', code: '\\chi' },
        { label: 'ψ', code: '\\psi' }, { label: 'ω', code: '\\omega' },
        { label: 'Γ', code: '\\Gamma' }, { label: 'Δ', code: '\\Delta' }, { label: 'Θ', code: '\\Theta' },
        { label: 'Λ', code: '\\Lambda' }, { label: 'Ξ', code: '\\Xi' }, { label: 'Π', code: '\\Pi' },
        { label: 'Σ', code: '\\Sigma' }, { label: 'Υ', code: '\\Upsilon' }, { label: 'Φ', code: '\\Phi' },
        { label: 'Ψ', code: '\\Psi' }, { label: 'Ω', code: '\\Omega' },
        { label: 'vareps', code: '\\varepsilon' }, { label: 'varphi', code: '\\varphi' },
        { label: 'ϑ', code: '\\vartheta' }, { label: 'ϖ', code: '\\varpi' },
        { label: 'ϱ', code: '\\varrho' }, { label: 'ς', code: '\\varsigma' }
    ],
    operators: [
        { label: '∑', code: '\\sum' }, { label: '∫', code: '\\int' }, { label: '∏', code: '\\prod' },
        { label: 'coprod', code: '\\coprod' },
        { label: 'lim', code: '\\lim' }, { label: '∞', code: '\\infty' },
        { label: '∂', code: '\\partial' }, { label: '∇', code: '\\nabla' },
        { label: '∪', code: '\\cup' }, { label: '∩', code: '\\cap' },
        { label: 'setminus', code: '\\setminus' },
        { label: '⊕', code: '\\oplus' }, { label: '⊗', code: '\\otimes' },
        { label: 'odot', code: '\\odot' }, { label: 'ominus', code: '\\ominus' },
        { label: 'times', code: '\\times' }, { label: 'div', code: '\\div' },
        { label: 'cdot', code: '\\cdot' }, { label: 'star', code: '\\star' },
        { label: '∧', code: '\\wedge' }, { label: '∨', code: '\\vee' },
        { label: '⋀', code: '\\bigwedge' }, { label: '⋁', code: '\\bigvee' },
        { label: '⋃', code: '\\bigcup' }, { label: '⋂', code: '\\bigcap' }
    ],
    relations: [
        { label: '=', code: '=' }, { label: '≠', code: '\\neq' },
        { label: '≈', code: '\\approx' }, { label: 'sim', code: '\\sim' },
        { label: 'cong', code: '\\cong' }, { label: 'equiv', code: '\\equiv' },
        { label: '∝', code: '\\propto' },
        { label: '<', code: '<' }, { label: '>', code: '>' },
        { label: '≤', code: '\\leq' }, { label: '≥', code: '\\geq' },
        { label: 'll', code: '\\ll' }, { label: 'gg', code: '\\gg' },
        { label: '∈', code: '\\in' }, { label: '∉', code: '\\notin' },
        { label: 'ni', code: '\\ni' },
        { label: '⊂', code: '\\subset' }, { label: '⊃', code: '\\supset' },
        { label: 'subseteq', code: '\\subseteq' }, { label: 'supseteq', code: '\\supseteq' },
        { label: 'perp', code: '\\perp' }, { label: 'mid', code: '\\mid' },
        { label: 'parallel', code: '\\parallel' },
        { label: '⊢', code: '\\vdash' }, { label: '⊣', code: '\\dashv' },
        { label: '⊨', code: '\\models' }
    ],
    matrices: [
        { label: '[ ]', code: '\\begin{bmatrix} a & b \\\\ c & d \\end{bmatrix}', display: '\\begin{bmatrix} \\Box & \\Box \\\\ \\Box & \\Box \\end{bmatrix}' },
        { label: '( )', code: '\\begin{pmatrix} a & b \\\\ c & d \\end{pmatrix}', display: '\\begin{pmatrix} \\Box & \\Box \\\\ \\Box & \\Box \\end{pmatrix}' },
        { label: '| |', code: '\\begin{vmatrix} a & b \\\\ c & d \\end{vmatrix}', display: '\\begin{vmatrix} \\Box & \\Box \\\\ \\Box & \\Box \\end{vmatrix}' },
        { label: '{ }', code: '\\begin{Bmatrix} a & b \\\\ c & d \\end{Bmatrix}', display: '\\begin{Bmatrix} \\Box & \\Box \\\\ \\Box & \\Box \\end{Bmatrix}' },
        { label: '|| ||', code: '\\begin{Vmatrix} a & b \\\\ c & d \\end{Vmatrix}', display: '\\begin{Vmatrix} \\Box & \\Box \\\\ \\Box & \\Box \\end{Vmatrix}' },
        { label: 'Vec', code: '\\begin{pmatrix} x \\\\ y \\\\ z \\end{pmatrix}', display: '\\begin{pmatrix} x \\\\ y \\\\ z \\end{pmatrix}' },
        { label: 'Small', code: '\\left( \\begin{smallmatrix} a & b \\\\ c & d \\end{smallmatrix} \\right)', display: '\\left( \\begin{smallmatrix} \\Box & \\Box \\\\ \\Box & \\Box \\end{smallmatrix} \\right)' },
        { label: 'Cases', code: '\\begin{cases} x & \\text{if } x > 0 \\\\ 0 & \\text{otherwise} \\end{cases}', display: '\\begin{cases} \\Box \\\\ \\Box \\end{cases}' }
    ],
    physics: [
        { label: 'ℏ', code: '\\hbar' }, { label: 'λ', code: '\\lambda' }, { label: 'ν', code: '\\nu' },
        { label: 'ω', code: '\\omega' }, { label: 'Ω', code: '\\Omega' }, { label: 'ρ', code: '\\rho' },
        { label: 'σ', code: '\\sigma' }, { label: 'τ', code: '\\tau' }, { label: 'μ', code: '\\mu' },
        { label: 'ε₀', code: '\\varepsilon_0' }, { label: 'μ₀', code: '\\mu_0' },
        { label: 'Δ', code: '\\Delta' }, { label: 'θ', code: '\\theta' },
        { label: 'α', code: '\\alpha' }, { label: 'β', code: '\\beta' }, { label: 'γ', code: '\\gamma' },
        { label: '⋅', code: '\\cdot' }, { label: '×', code: '\\times' },
        { label: 'vec', code: '\\vec{v}', display: '\\vec{v}' },
        { label: 'hat', code: '\\hat{n}', display: '\\hat{n}' },
        { label: 'bar', code: '\\bar{x}', display: '\\bar{x}' },
        { label: 'bra', code: '\\langle \\psi |', display: '\\langle \\psi |' },
        { label: 'ket', code: '| \\psi \\rangle', display: '| \\psi \\rangle' },
        { label: 'braket', code: '\\langle \\phi | \\psi \\rangle', display: '\\langle \\phi | \\psi \\rangle' },
        { label: 'Å', code: '\\AA' }, { label: '°C', code: '^\\circ\\text{C}' },
        { label: 'J', code: '\\text{J}' }, { label: 'N', code: '\\text{N}' },
        { label: 'W', code: '\\text{W}' }, { label: 'Hz', code: '\\text{Hz}' },
        { label: 'Pa', code: '\\text{Pa}' }, { label: 'V', code: '\\text{V}' }
    ],
    chemistry: [
        { label: '→', code: '\\rightarrow', display: '\\rightarrow' },
        { label: '⇌', code: '\\rightleftharpoons', display: '\\rightleftharpoons' },
        { label: 'xrightarrow', code: '\\xrightarrow[\\text{below}]{\\text{above}}', display: '\\xrightarrow[\\text{below}]{\\text{above}}' },
        { label: '↑', code: '\\uparrow', display: '\\uparrow' },
        { label: '↓', code: '\\downarrow', display: '\\downarrow' },
        { label: 'H₂O', code: '\\ce{H2O}', display: '\\text{H}_2\\text{O}' },
        { label: 'CO₂', code: '\\ce{CO2}', display: '\\text{CO}_2' },
        { label: 'Isotope', code: '^{A}_{Z}X', display: '^{A}_{Z}X' },
        { label: '+', code: '+' }, { label: '-', code: '-' },
        { label: 'e-', code: 'e^-' }, { label: 'H+', code: 'H^+' }
    ],
    economics: [
        { label: '$', code: '\\$' }, { label: '€', code: '\\euro' }, { label: '£', code: '\\pound' },
        { label: '¥', code: '\\yen' }, { label: '%', code: '\\%' },
        { label: 'MC', code: 'MC', display: '\\text{MC}' }, { label: 'MR', code: 'MR', display: '\\text{MR}' },
        { label: 'AC', code: 'AC', display: '\\text{AC}' }, { label: 'AR', code: 'AR', display: '\\text{AR}' },
        { label: 'TC', code: 'TC', display: '\\text{TC}' }, { label: 'TR', code: 'TR', display: '\\text{TR}' },
        { label: 'Q', code: 'Q', display: 'Q' }, { label: 'P', code: 'P', display: 'P' },
        { label: 'Elasticity', code: '\\varepsilon', display: '\\varepsilon' },
        { label: 'Utility', code: 'U(x)', display: 'U(x)' },
        { label: 'Profit', code: '\\pi', display: '\\pi' },
        { label: 'Δ', code: '\\Delta' }
    ]
};

// Periodic Table Data (Expanded with Categories)
const periodicTableData = [
    // Row 1
    { n: 1, s: 'H', name: 'Hydrogen', c: 'nonmetal' }, ...Array(16).fill({ n: 0 }), { n: 2, s: 'He', name: 'Helium', c: 'noble' },
    // Row 2
    { n: 3, s: 'Li', name: 'Lithium', c: 'alkali' }, { n: 4, s: 'Be', name: 'Beryllium', c: 'alkaline-earth' }, ...Array(10).fill({ n: 0 }), { n: 5, s: 'B', name: 'Boron', c: 'metalloid' }, { n: 6, s: 'C', name: 'Carbon', c: 'nonmetal' }, { n: 7, s: 'N', name: 'Nitrogen', c: 'nonmetal' }, { n: 8, s: 'O', name: 'Oxygen', c: 'nonmetal' }, { n: 9, s: 'F', name: 'Fluorine', c: 'halogen' }, { n: 10, s: 'Ne', name: 'Neon', c: 'noble' },
    // Row 3
    { n: 11, s: 'Na', name: 'Sodium', c: 'alkali' }, { n: 12, s: 'Mg', name: 'Magnesium', c: 'alkaline-earth' }, ...Array(10).fill({ n: 0 }), { n: 13, s: 'Al', name: 'Aluminium', c: 'post-transition' }, { n: 14, s: 'Si', name: 'Silicon', c: 'metalloid' }, { n: 15, s: 'P', name: 'Phosphorus', c: 'nonmetal' }, { n: 16, s: 'S', name: 'Sulfur', c: 'nonmetal' }, { n: 17, s: 'Cl', name: 'Chlorine', c: 'halogen' }, { n: 18, s: 'Ar', name: 'Argon', c: 'noble' },
    // Row 4
    { n: 19, s: 'K', name: 'Potassium', c: 'alkali' }, { n: 20, s: 'Ca', name: 'Calcium', c: 'alkaline-earth' }, { n: 21, s: 'Sc', name: 'Scandium', c: 'transition' }, { n: 22, s: 'Ti', name: 'Titanium', c: 'transition' }, { n: 23, s: 'V', name: 'Vanadium', c: 'transition' }, { n: 24, s: 'Cr', name: 'Chromium', c: 'transition' }, { n: 25, s: 'Mn', name: 'Manganese', c: 'transition' }, { n: 26, s: 'Fe', name: 'Iron', c: 'transition' }, { n: 27, s: 'Co', name: 'Cobalt', c: 'transition' }, { n: 28, s: 'Ni', name: 'Nickel', c: 'transition' }, { n: 29, s: 'Cu', name: 'Copper', c: 'transition' }, { n: 30, s: 'Zn', name: 'Zinc', c: 'transition' }, { n: 31, s: 'Ga', name: 'Gallium', c: 'post-transition' }, { n: 32, s: 'Ge', name: 'Germanium', c: 'metalloid' }, { n: 33, s: 'As', name: 'Arsenic', c: 'metalloid' }, { n: 34, s: 'Se', name: 'Selenium', c: 'nonmetal' }, { n: 35, s: 'Br', name: 'Bromine', c: 'halogen' }, { n: 36, s: 'Kr', name: 'Krypton', c: 'noble' },
    // Row 5
    { n: 37, s: 'Rb', name: 'Rubidium', c: 'alkali' }, { n: 38, s: 'Sr', name: 'Strontium', c: 'alkaline-earth' }, { n: 39, s: 'Y', name: 'Yttrium', c: 'transition' }, { n: 40, s: 'Zr', name: 'Zirconium', c: 'transition' }, { n: 41, s: 'Nb', name: 'Niobium', c: 'transition' }, { n: 42, s: 'Mo', name: 'Molybdenum', c: 'transition' }, { n: 43, s: 'Tc', name: 'Technetium', c: 'transition' }, { n: 44, s: 'Ru', name: 'Ruthenium', c: 'transition' }, { n: 45, s: 'Rh', name: 'Rhodium', c: 'transition' }, { n: 46, s: 'Pd', name: 'Palladium', c: 'transition' }, { n: 47, s: 'Ag', name: 'Silver', c: 'transition' }, { n: 48, s: 'Cd', name: 'Cadmium', c: 'transition' }, { n: 49, s: 'In', name: 'Indium', c: 'post-transition' }, { n: 50, s: 'Sn', name: 'Tin', c: 'post-transition' }, { n: 51, s: 'Sb', name: 'Antimony', c: 'metalloid' }, { n: 52, s: 'Te', name: 'Tellurium', c: 'metalloid' }, { n: 53, s: 'I', name: 'Iodine', c: 'halogen' }, { n: 54, s: 'Xe', name: 'Xenon', c: 'noble' },
    // Row 6
    { n: 55, s: 'Cs', name: 'Cesium', c: 'alkali' }, { n: 56, s: 'Ba', name: 'Barium', c: 'alkaline-earth' }, { n: 0 }, { n: 72, s: 'Hf', name: 'Hafnium', c: 'transition' }, { n: 73, s: 'Ta', name: 'Tantalum', c: 'transition' }, { n: 74, s: 'W', name: 'Tungsten', c: 'transition' }, { n: 75, s: 'Re', name: 'Rhenium', c: 'transition' }, { n: 76, s: 'Os', name: 'Osmium', c: 'transition' }, { n: 77, s: 'Ir', name: 'Iridium', c: 'transition' }, { n: 78, s: 'Pt', name: 'Platinum', c: 'transition' }, { n: 79, s: 'Au', name: 'Gold', c: 'transition' }, { n: 80, s: 'Hg', name: 'Mercury', c: 'transition' }, { n: 81, s: 'Tl', name: 'Thallium', c: 'post-transition' }, { n: 82, s: 'Pb', name: 'Lead', c: 'post-transition' }, { n: 83, s: 'Bi', name: 'Bismuth', c: 'post-transition' }, { n: 84, s: 'Po', name: 'Polonium', c: 'metalloid' }, { n: 85, s: 'At', name: 'Astatine', c: 'halogen' }, { n: 86, s: 'Rn', name: 'Radon', c: 'noble' },
    // Row 7
    { n: 87, s: 'Fr', name: 'Francium', c: 'alkali' }, { n: 88, s: 'Ra', name: 'Radium', c: 'alkaline-earth' }, { n: 0 }, { n: 104, s: 'Rf', name: 'Rutherfordium', c: 'transition' }, { n: 105, s: 'Db', name: 'Dubnium', c: 'transition' }, { n: 106, s: 'Sg', name: 'Seaborgium', c: 'transition' }, { n: 107, s: 'Bh', name: 'Bohrium', c: 'transition' }, { n: 108, s: 'Hs', name: 'Hassium', c: 'transition' }, { n: 109, s: 'Mt', name: 'Meitnerium', c: 'transition' }, { n: 110, s: 'Ds', name: 'Darmstadtium', c: 'transition' }, { n: 111, s: 'Rg', name: 'Roentgenium', c: 'transition' }, { n: 112, s: 'Cn', name: 'Copernicium', c: 'transition' }, { n: 113, s: 'Nh', name: 'Nihonium', c: 'post-transition' }, { n: 114, s: 'Fl', name: 'Flerovium', c: 'post-transition' }, { n: 115, s: 'Mc', name: 'Moscovium', c: 'post-transition' }, { n: 116, s: 'Lv', name: 'Livermorium', c: 'post-transition' }, { n: 117, s: 'Ts', name: 'Tennessine', c: 'halogen' }, { n: 118, s: 'Og', name: 'Oganesson', c: 'noble' },
    // Row 8 (Lanthanides)
    ...Array(3).fill({ n: 0 }), { n: 57, s: 'La', name: 'Lanthanum', c: 'lanthanide' }, { n: 58, s: 'Ce', name: 'Cerium', c: 'lanthanide' }, { n: 59, s: 'Pr', name: 'Praseodymium', c: 'lanthanide' }, { n: 60, s: 'Nd', name: 'Neodymium', c: 'lanthanide' }, { n: 61, s: 'Pm', name: 'Promethium', c: 'lanthanide' }, { n: 62, s: 'Sm', name: 'Samarium', c: 'lanthanide' }, { n: 63, s: 'Eu', name: 'Europium', c: 'lanthanide' }, { n: 64, s: 'Gd', name: 'Gadolinium', c: 'lanthanide' }, { n: 65, s: 'Tb', name: 'Terbium', c: 'lanthanide' }, { n: 66, s: 'Dy', name: 'Dysprosium', c: 'lanthanide' }, { n: 67, s: 'Ho', name: 'Holmium', c: 'lanthanide' }, { n: 68, s: 'Er', name: 'Erbium', c: 'lanthanide' }, { n: 69, s: 'Tm', name: 'Thulium', c: 'lanthanide' }, { n: 70, s: 'Yb', name: 'Ytterbium', c: 'lanthanide' }, { n: 71, s: 'Lu', name: 'Lutetium', c: 'lanthanide' },
    // Row 9 (Actinides)
    ...Array(3).fill({ n: 0 }), { n: 89, s: 'Ac', name: 'Actinium', c: 'actinide' }, { n: 90, s: 'Th', name: 'Thorium', c: 'actinide' }, { n: 91, s: 'Pa', name: 'Protactinium', c: 'actinide' }, { n: 92, s: 'U', name: 'Uranium', c: 'actinide' }, { n: 93, s: 'Np', name: 'Neptunium', c: 'actinide' }, { n: 94, s: 'Pu', name: 'Plutonium', c: 'actinide' }, { n: 95, s: 'Am', name: 'Americium', c: 'actinide' }, { n: 96, s: 'Cm', name: 'Curium', c: 'actinide' }, { n: 97, s: 'Bk', name: 'Berkelium', c: 'actinide' }, { n: 98, s: 'Cf', name: 'Californium', c: 'actinide' }, { n: 99, s: 'Es', name: 'Einsteinium', c: 'actinide' }, { n: 100, s: 'Fm', name: 'Fermium', c: 'actinide' }, { n: 101, s: 'Md', name: 'Mendelevium', c: 'actinide' }, { n: 102, s: 'No', name: 'Nobelium', c: 'actinide' }, { n: 103, s: 'Lr', name: 'Lawrencium', c: 'actinide' }
];

// Math Tab Logic
const mathTabs = document.getElementById('math-tabs');
// const mathSymbolsGrid = document.getElementById('math-symbols-grid'); // Already declared

// Switch Math Tab
function switchMathTab(category) {
    // Update active tab UI
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('onclick').includes(`'${category}'`)) {
            btn.classList.add('active');
        }
    });

    if (category === 'periodic') {
        mathSymbolsGrid.style.display = 'none';
        periodicTableContainer.style.display = 'block';
        openPeriodicTable();
    } else {
        mathSymbolsGrid.style.display = 'grid';
        periodicTableContainer.style.display = 'none';

        // Render symbols
        mathSymbolsGrid.innerHTML = '';
        const symbols = mathSymbols[category] || [];
        symbols.forEach(sym => {
            const btn = document.createElement('div');
            btn.className = 'symbol-btn';

            // Use KaTeX to render the label if it's LaTeX-like or has a display property
            // Otherwise just text
            const displayContent = sym.display || sym.label || '';

            // Check if it needs KaTeX rendering (contains backslash or special chars)
            if (displayContent && (displayContent.includes('\\') || displayContent.includes('^') || displayContent.includes('_'))) {
                try {
                    if (typeof katex !== 'undefined') {
                        katex.render(displayContent, btn, { throwOnError: false });
                    } else {
                        btn.textContent = sym.label || '?';
                    }
                } catch (e) {
                    console.error('KaTeX error:', e);
                    btn.textContent = sym.label || '?';
                }
            } else {
                btn.textContent = sym.label || '?';
            }

            btn.onclick = () => insertSymbol(sym.code);
            mathSymbolsGrid.appendChild(btn);
        });
    }
}

// Insert Symbol
function insertSymbol(symbol) {
    if (mathModal.style.display === 'block') {
        const start = mathInput.selectionStart;
        const end = mathInput.selectionEnd;
        const text = mathInput.value;
        const before = text.substring(0, start);
        const after = text.substring(end, text.length);

        mathInput.value = before + symbol + after;
        mathInput.selectionStart = mathInput.selectionEnd = start + symbol.length;
        mathInput.focus();
        renderMath(mathInput.value);
    } else {
        const doc = cmEditor.getDoc();
        const cursor = doc.getCursor();
        doc.replaceRange(symbol, cursor);
        cmEditor.focus();
    }
}

// Open Math Builder
function openMathBuilder(mode, code) {
    // Normalize mode
    if (mode === 'inlineMath') mode = 'inline';
    if (mode === 'displayMath') mode = 'display';

    currentMathMode = mode;
    isChemMode = (mode === 'chemistry');

    // Update UI
    const titleEl = document.getElementById('math-modal-title');
    if (titleEl) {
        titleEl.textContent = (mode === 'inline' ? 'Inline Math' : (mode === 'display' ? 'Display Math' : 'Equation Builder'));
    }

    const chemCheck = document.getElementById('math-chem-check');
    const blockCheck = document.getElementById('math-block-check');

    if (chemCheck) chemCheck.checked = isChemMode;
    if (blockCheck) blockCheck.checked = (mode === 'display');

    // Show modal
    mathModal.style.display = 'block';

    // Start Tour
    setTimeout(() => startFeatureTour('math'), 500);

    // Strip delimiters from code if present
    let cleanCode = code ? code : '';
    cleanCode = cleanCode.trim();
    if (cleanCode.startsWith('$$') && cleanCode.endsWith('$$')) {
        cleanCode = cleanCode.substring(2, cleanCode.length - 2).trim();
    } else if (cleanCode.startsWith('$') && cleanCode.endsWith('$')) {
        cleanCode = cleanCode.substring(1, cleanCode.length - 1).trim();
    }

    // Set initial content
    mathInput.value = cleanCode;
    mathPreview.innerHTML = ''; // Clear preview

    // Render initial preview
    if (cleanCode) {
        renderMath(cleanCode);
    }

    // Switch to appropriate tab
    if (mode === 'periodic') {
        switchMathTab('periodic');
    } else if (['physics', 'chemistry', 'economics', 'matrices'].includes(mode)) {
        switchMathTab(mode);
    } else if (isChemMode) {
        switchMathTab('chemistry');
    } else {
        switchMathTab('common');
    }
}// Close Math Modal
function closeMathModal() {
    mathModal.style.display = 'none';
}

// Render Math
function renderMath(code) {
    // Clear previous
    mathPreview.innerHTML = '';

    if (!code || !code.trim()) return;

    if (typeof katex === 'undefined') {
        mathPreview.innerHTML = '<span style="color:red">KaTeX not loaded</span>';
        return;
    }

    // Determine if display mode
    const isDisplay = currentMathMode === 'display' || code.trim().startsWith('$$');

    // Render with KaTeX
    try {
        // Remove delimiters for rendering if present, as katex.render expects raw latex
        let cleanCode = code;
        if (cleanCode.startsWith('$$') && cleanCode.endsWith('$$')) {
            cleanCode = cleanCode.substring(2, cleanCode.length - 2);
        } else if (cleanCode.startsWith('$') && cleanCode.endsWith('$')) {
            cleanCode = cleanCode.substring(1, cleanCode.length - 1);
        }

        katex.render(cleanCode, mathPreview, {
            throwOnError: false,
            displayMode: isDisplay
        });
    } catch (e) {
        console.error("Math rendering error:", e);
        mathPreview.innerHTML = `<span style="color:red; font-size:12px">Error: ${e.message}</span>`;
    }
}

// Insert Math Template
function insertMathTemplate(template) {
    const code = templates.math.find(t => t.id === template).code;
    insertTemplateCode(code);
    closeTemplateModal();
}

// Insert Markscheme Directly
function insertMarkscheme() {
    insertTemplateCode(templates.markscheme);
}

// Open Periodic Table
function openPeriodicTable() {
    periodicTableContainer.style.display = 'block';
    periodicTableGrid.innerHTML = ''; // Clear previous

    // Create grid
    const rows = 9;
    const cols = 18;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const index = r * cols + c;
            const element = periodicTableData[index];
            const cell = document.createElement('div');
            cell.className = 'periodic-table-cell';

            if (element && element.n) {
                cell.innerHTML = `<span class="element-symbol">${element.s}</span>`;
                if (element.c) {
                    cell.classList.add(element.c);
                }
                cell.onclick = () => insertElementToEditor(element);
            } else {
                cell.classList.add('empty');
            }

            periodicTableGrid.appendChild(cell);
        }
    }
}

// Close Periodic Table
function closePeriodicTable() {
    periodicTableContainer.style.display = 'none';
}

// Insert Element to Editor
function insertElementToEditor(element) {
    const elementCode = `\\ce{${element.s}}`;

    if (mathModal.style.display === 'block') {
        const start = mathInput.selectionStart;
        const end = mathInput.selectionEnd;
        const text = mathInput.value;
        const before = text.substring(0, start);
        const after = text.substring(end, text.length);

        mathInput.value = before + elementCode + after;
        mathInput.selectionStart = mathInput.selectionEnd = start + elementCode.length;
        mathInput.focus();
        renderMath(mathInput.value);
    } else {
        const doc = cmEditor.getDoc();
        const cursor = doc.getCursor();
        doc.replaceRange(`$${elementCode}$`, cursor);
        cmEditor.focus();
    }
    closePeriodicTable();
}

// Toggle Periodic Table
function togglePeriodicTable() {
    if (periodicTableContainer.style.display === 'block') {
        closePeriodicTable();
    } else {
        openPeriodicTable();
    }
}

// Insert Math From Builder
function insertMathFromBuilder() {
    let code = mathInput.value;
    if (!code) {
        closeMathModal();
        return;
    }

    let isBlock = false;

    // Wrap based on mode
    if (isChemMode) {
        if (!code.includes('\\ce{')) {
            code = `\\ce{${code}}`;
        }
        code = `$${code}$`;
    } else if (currentMathMode === 'display' || (mathBlockCheck && mathBlockCheck.checked)) {
        code = `$$\n${code}\n$$`;
        isBlock = true;
    } else {
        code = `$${code}$`;
    }

    if (isBlock) {
        insertTemplateCode(code);
    } else {
        const doc = cmEditor.getDoc();
        const cursor = doc.getCursor();
        doc.replaceRange(code, cursor);
        render();
        cmEditor.focus();
    }

    closeMathModal();
}

// Event Listeners for Math Builder
if (mathInput) {
    mathInput.addEventListener('input', () => {
        renderMath(mathInput.value);
    });
}

// Tutorial Logic
const tourTooltip = document.getElementById('tour-tooltip');
const tourTitle = document.getElementById('tour-title');
const tourDesc = document.getElementById('tour-desc');
const tourProgress = document.getElementById('tour-progress');

let currentStep = 0;

const tutorialSteps = [
    {
        target: '#editor-tabs-bar',
        title: "Tab Management",
        desc: "Create, switch, rename, and close multiple documents. Right-click a tab to rename it.",
        position: 'bottom'
    },
    {
        target: '#tour-formatting',
        title: "Formatting Tools",
        desc: "Use these buttons to format your text with bold, italics, or headings.",
        position: 'bottom'
    },
    {
        target: '#tour-lists',
        title: "Lists & Tasks",
        desc: "Create bullet points, numbered lists, or interactive task lists.",
        position: 'bottom'
    },
    {
        target: '#tour-inserts',
        title: "Insert Media",
        desc: "Add links, images, code blocks, quotes, or tables to your document.",
        position: 'bottom'
    },
    {
        target: '#tour-visuals',
        title: "Visual Tools",
        desc: "Insert charts and diagrams using templates.",
        position: 'bottom'
    },
    {
        target: '#tour-science',
        title: "STEM Symbols",
        desc: "Insert math formulas, chemistry symbols, and periodic table elements or anything STEM Related from these presets.",
        position: 'bottom'
    },
    {
        target: '#tour-view',
        title: "View Modes",
        desc: "Switch between Split View, Code Only, or Preview Only modes.",
        position: 'bottom'
    },
    {
        target: '#tour-download',
        title: "Download",
        desc: "Export your work as a Markdown file or a PDF document. The file name will match your tab title.",
        position: 'bottom'
    },
    {
        target: '#tour-settings',
        title: "Settings",
        desc: "Configure theme, auto-save, and other editor preferences.",
        position: 'bottom'
    },
    {
        target: '#preview',
        title: "Interactive Preview",
        desc: "Click checkboxes to toggle tasks, or double-click text to edit it.",
        position: 'left'
    }
];

function initTutorial() {
    const enabled = localStorage.getItem('ivy_tutorials_enabled') !== 'false';
    if (!enabled) return;

    const seen = localStorage.getItem('ivy_tutorial_seen');
    if (!seen && tourTooltip) {
        currentStep = 0;
        showTourStep();
    }
}

function showTourStep() {
    if (currentStep >= tutorialSteps.length) {
        closeTutorial();
        return;
    }

    const step = tutorialSteps[currentStep];
    const targetEl = document.querySelector(step.target);

    if (!targetEl) {
        // Skip if target not found (e.g. hidden)
        currentStep++;
        showTourStep();
        return;
    }

    // Update Content
    tourTitle.textContent = step.title;
    tourDesc.textContent = step.desc;
    tourProgress.textContent = `${currentStep + 1}/${tutorialSteps.length}`;

    // Highlight Target
    document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
    targetEl.classList.add('tour-highlight');

    // Position Tooltip
    tourTooltip.style.display = 'block';
    positionTooltip(targetEl, step.position);
}

function positionTooltip(target, position) {
    const rect = target.getBoundingClientRect();
    const tooltipRect = tourTooltip.getBoundingClientRect();
    const arrow = tourTooltip.querySelector('.tour-arrow');

    let top, left;
    const gap = 15;

    // Reset arrow styles
    arrow.style = '';

    if (position === 'bottom') {
        top = rect.bottom + gap;
        left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);

        // Arrow on top
        arrow.style.top = '-6px';
        arrow.style.left = '50%';
        arrow.style.transform = 'translateX(-50%) rotate(45deg)';
    } else if (position === 'top') {
        top = rect.top - tooltipRect.height - gap;
        left = rect.left + (rect.width / 2) - (tooltipRect.width / 2);

        // Arrow on bottom
        arrow.style.bottom = '-6px';
        arrow.style.left = '50%';
        arrow.style.transform = 'translateX(-50%) rotate(225deg)';
    } else if (position === 'left') {
        top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
        left = rect.left - tooltipRect.width - gap;

        // Arrow on right
        arrow.style.right = '-6px';
        arrow.style.top = '50%';
        arrow.style.transform = 'translateY(-50%) rotate(135deg)';
    } else if (position === 'right') {
        top = rect.top + (rect.height / 2) - (tooltipRect.height / 2);
        left = rect.right + gap;

        // Arrow on left
        arrow.style.left = '-6px';
        arrow.style.top = '50%';
        arrow.style.transform = 'translateY(-50%) rotate(-45deg)';
    }

    // Boundary checks (keep on screen)
    if (left < 10) left = 10;
    if (left + tooltipRect.width > window.innerWidth - 10) left = window.innerWidth - tooltipRect.width - 10;
    if (top < 10) top = 10;
    if (top + tooltipRect.height > window.innerHeight - 10) top = window.innerHeight - tooltipRect.height - 10;

    tourTooltip.style.top = `${top}px`;
    tourTooltip.style.left = `${left}px`;
}

function nextTutorialStep() {
    currentStep++;
    showTourStep();
}

function closeTutorial() {
    tourTooltip.style.display = 'none';
    document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
    localStorage.setItem('ivy_tutorial_seen', 'true');
}

function skipTutorial() {
    closeTutorial();
}

// Initialize Tutorial on Load
window.addEventListener('DOMContentLoaded', () => {
    // Apply Theme
    applyTheme(localStorage.getItem('ivy_theme') || 'dark');

    // Wait a bit for layout to settle
    setTimeout(initTutorial, 500);
});

// Handle Resize
window.addEventListener('resize', () => {
    if (tourTooltip.style.display === 'block') {
        showTourStep(); // Re-calculate position
    }
});

// Feature Tours
const featureTours = {
    math: [
        {
            target: '#math-input',
            title: "Equation Input",
            desc: "Type LaTeX code here directly, or use the buttons below to insert symbols.",
            position: 'top'
        },
        {
            target: '.math-symbols-tabs',
            title: "Symbol Categories",
            desc: "Switch between different categories like Calculus, Greek letters, or Chemistry symbols.",
            position: 'top'
        },
        {
            target: '#math-preview',
            title: "Live Preview",
            desc: "See how your equation will look as you type.",
            position: 'bottom'
        }
    ],
    mermaid: [
        {
            target: '#template-search',
            title: "Search Diagrams",
            desc: "Filter diagrams by name (e.g., 'flowchart', 'sequence').",
            position: 'bottom'
        },
        {
            target: '#template-grid',
            title: "Select Template",
            desc: "Click on a diagram template to insert it into your document.",
            position: 'top'
        }
    ],
    charts: [
        {
            target: '#template-grid',
            title: "Chart Templates",
            desc: "Choose from Bar, Line, Pie, or Doughnut charts. The code is editable JSON.",
            position: 'top'
        }
    ]
};

let activeFeatureTour = null;
let currentFeatureStep = 0;

function startFeatureTour(feature) {
    const enabled = localStorage.getItem('ivy_tutorials_enabled') !== 'false';
    if (!enabled) return;

    const seenKey = `ivy_tour_${feature}_seen`;
    if (localStorage.getItem(seenKey)) return;

    activeFeatureTour = featureTours[feature];
    if (!activeFeatureTour) return;

    currentFeatureStep = 0;
    showFeatureTourStep(feature);
}

function showFeatureTourStep(feature) {
    if (!activeFeatureTour || currentFeatureStep >= activeFeatureTour.length) {
        closeFeatureTour(feature);
        return;
    }

    const step = activeFeatureTour[currentFeatureStep];
    const targetEl = document.querySelector(step.target);

    if (!targetEl || targetEl.offsetParent === null) {
        // If target is not visible, try next step
        currentFeatureStep++;
        showFeatureTourStep(feature);
        return;
    }

    // Reuse the main tour tooltip but with feature-specific logic
    tourTitle.textContent = step.title;
    tourDesc.textContent = step.desc;
    tourProgress.textContent = `${currentFeatureStep + 1}/${activeFeatureTour.length}`;

    // Update buttons for feature tour
    const nextBtn = tourTooltip.querySelector('.primary-btn');
    nextBtn.onclick = () => nextFeatureStep(feature);

    const skipBtn = tourTooltip.querySelector('.secondary-btn'); // Actually we removed skip button, let's check HTML
    // The HTML has only Next button now.

    // Highlight
    document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
    targetEl.classList.add('tour-highlight');

    tourTooltip.style.display = 'block';
    // Ensure tooltip is above modal
    tourTooltip.style.zIndex = '20002';

    positionTooltip(targetEl, step.position);
}

function nextFeatureStep(feature) {
    currentFeatureStep++;
    showFeatureTourStep(feature);
}

function closeFeatureTour(feature) {
    tourTooltip.style.display = 'none';
    document.querySelectorAll('.tour-highlight').forEach(el => el.classList.remove('tour-highlight'));
    localStorage.setItem(`ivy_tour_${feature}_seen`, 'true');
    activeFeatureTour = null;

    // Reset Next button to main tour logic just in case
    const nextBtn = tourTooltip.querySelector('.primary-btn');
    nextBtn.onclick = nextTutorialStep;
}

// Context Menu Logic
const contextMenu = document.getElementById('context-menu');

document.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const { clientX: mouseX, clientY: mouseY } = e;

    // Adjust position if close to edge
    let top = mouseY;
    let left = mouseX;

    if (contextMenu) {
        contextMenu.style.top = `${top}px`;
        contextMenu.style.left = `${left}px`;
        contextMenu.style.display = 'block';
    }
});

document.addEventListener('click', (e) => {
    if (contextMenu && e.target.offsetParent !== contextMenu) {
        contextMenu.style.display = 'none';
    }
});

// Close modals and context menus when clicking outside
window.addEventListener('click', (event) => {
    // Close Modals
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }

    // Close Context Menu
    const contextMenu = document.getElementById('context-menu');
    if (contextMenu && contextMenu.style.display === 'block') {
        // Check if click is inside context menu
        if (!contextMenu.contains(event.target)) {
            contextMenu.style.display = 'none';
        }
    }
});

// Close context menu and modals on Escape key
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        if (contextMenu && contextMenu.style.display === 'block') {
            contextMenu.style.display = 'none';
        }
        if (typeof closeTableModal === 'function' && tableModal && tableModal.style.display === 'block') {
            closeTableModal();
        }
        if (typeof closeMathModal === 'function' && mathModal && mathModal.style.display === 'block') {
            closeMathModal();
        }
        if (typeof closeTemplateModal === 'function' && templateModal && templateModal.style.display === 'block') {
            closeTemplateModal();
        }
        if (typeof closePeriodicTable === 'function' && periodicTableContainer && periodicTableContainer.style.display === 'block') {
            closePeriodicTable();
        }
        if (typeof closeSettingsModal === 'function' && settingsModal && settingsModal.style.display === 'block') {
            closeSettingsModal();
        }
    }
});

if (mathBlockCheck) {
    mathBlockCheck.addEventListener('change', () => {
        currentMathMode = mathBlockCheck.checked ? 'display' : 'inline';
        renderMath(mathInput.value);
    });
}

if (mathChemCheck) {
    mathChemCheck.addEventListener('change', () => {
        isChemMode = mathChemCheck.checked;
        if (isChemMode) {
            switchMathTab('chemistry');
        }
        renderMath(mathInput.value);
    });
}

// View Modes
let currentViewModeIndex = 0;
const viewModes = ['split', 'code', 'preview'];

function toggleViewMode() {
    currentViewModeIndex = (currentViewModeIndex + 1) % viewModes.length;
    setViewMode(viewModes[currentViewModeIndex]);
}

// Middle Click to Toggle View Mode
document.addEventListener('mousedown', (e) => {
    if (e.button === 1) { // Middle click
        e.preventDefault(); // Prevent default scroll behavior
        toggleViewMode();
    }
});

function setViewMode(mode) {
    const editorPane = document.querySelector('.editor-pane');
    const previewPane = document.querySelector('.preview-container');

    // Update index if set manually
    currentViewModeIndex = viewModes.indexOf(mode);

    // Reset
    editorPane.style.display = 'block';
    previewPane.style.display = 'flex'; // Flex for centering
    editorPane.style.flex = '1';
    previewPane.style.flex = '1';

    if (mode === 'code') {
        previewPane.style.display = 'none';
    } else if (mode === 'preview') {
        editorPane.style.display = 'none';
    }

    // Refresh CodeMirror to handle resize
    if (cmEditor) cmEditor.refresh();
}

// Download PDF
function downloadPDF() {
    // Temporarily force preview mode for clean printing
    const previousMode = viewModes[currentViewModeIndex];
    setViewMode('preview');

    // Wait for layout update then print
    setTimeout(() => {
        window.print();
        // Restore view mode
        setViewMode(previousMode);
        triggerConfetti();
    }, 500);
}

// Trigger Confetti
function triggerConfetti() {
    if (typeof confetti === 'function') {
        confetti({
            particleCount: 100,
            spread: 70,
            origin: { y: 0.6 }
        });
    }
}

function downloadMarkdown() {
    if (!cmEditor) return;
    const markdown = cmEditor.getValue();
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;

    // Use current tab title
    const currentDoc = documents.find(d => d.id === activeDocId);
    let filename = currentDoc ? currentDoc.title : 'document.md';
    if (!filename.endsWith('.md')) filename += '.md';

    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Mark as saved (unmodified)
    if (currentDoc) {
        currentDoc.modified = false;
        renderTabs();
    }

    triggerConfetti();
}// Settings Modal Logic
const settingsModal = document.getElementById('settings-modal');
const settingTheme = document.getElementById('setting-theme');
const settingAutosave = document.getElementById('setting-autosave');
const settingTutorials = document.getElementById('setting-tutorials');

function openSettingsModal() {
    if (settingsModal) {
        settingsModal.style.display = 'block';

        // Load settings
        if (settingTheme) settingTheme.value = localStorage.getItem('ivy_theme') || 'dark';
        if (settingAutosave) settingAutosave.checked = localStorage.getItem('ivy_autosave') !== 'false';
        if (settingTutorials) settingTutorials.checked = localStorage.getItem('ivy_tutorials_enabled') !== 'false';
    }
}

function closeSettingsModal() {
    if (settingsModal) settingsModal.style.display = 'none';
}

// Settings Event Listeners
if (settingTheme) {
    settingTheme.addEventListener('change', () => {
        applyTheme(settingTheme.value);
    });
}

if (settingAutosave) {
    settingAutosave.addEventListener('change', () => {
        localStorage.setItem('ivy_autosave', settingAutosave.checked);
    });
}

if (settingTutorials) {
    settingTutorials.addEventListener('change', () => {
        localStorage.setItem('ivy_tutorials_enabled', settingTutorials.checked);
    });
}

// Format Document using Prettier
function formatDocument() {
    if (!cmEditor) return;

    // Check if Prettier is loaded
    if (typeof prettier === 'undefined' || typeof prettierPlugins === 'undefined') {
        // Fallback: Basic Markdown Formatting if Prettier fails to load
        // This is a simple formatter that fixes common issues
        const doc = cmEditor.getDoc();
        const cursor = doc.getCursor();
        let content = cmEditor.getValue();

        // Simple regex replacements for basic cleanup
        // 1. Fix multiple blank lines (max 2)
        content = content.replace(/\n{3,}/g, '\n\n');
        // 2. Fix list spacing
        content = content.replace(/^(\s*[-*+])\s+/gm, '$1 ');
        // 3. Fix header spacing
        content = content.replace(/^(#+)([^#\s])/gm, '$1 $2');

        cmEditor.setValue(content);
        doc.setCursor(cursor);
        return;
    }

    try {
        const currentContent = cmEditor.getValue();
        const formatted = prettier.format(currentContent, {
            parser: "markdown",
            plugins: prettierPlugins,
            proseWrap: "always",
            printWidth: 80,
            tabWidth: 4
        });

        // Only update if changed to preserve cursor/history better
        if (formatted !== currentContent) {
            const doc = cmEditor.getDoc();
            const cursor = doc.getCursor();
            cmEditor.setValue(formatted);
            doc.setCursor(cursor);
        }
    } catch (e) {
        console.error("Formatting error:", e);
        alert("Could not format document: " + e.message);
    }
}

// Interactivity Functions
function setupInteractivity() {
    // Task List Checkboxes
    const checkboxes = preview.querySelectorAll('.task-list-item-checkbox');
    checkboxes.forEach((checkbox, index) => {
        checkbox.addEventListener('change', () => {
            toggleTask(index, checkbox.checked);
        });
    });

    // Double Click to Edit
    preview.addEventListener('dblclick', (e) => {
        // Ignore if clicking a checkbox or interactive element
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'BUTTON') return;

        let target = e.target;
        // Try to find a block element
        while (target && target !== preview && !['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'LI', 'PRE', 'BLOCKQUOTE'].includes(target.tagName)) {
            target = target.parentElement;
        }

        if (target && target !== preview) {
            const text = target.innerText;
            syncEditor(text);
        }
    });
}

function toggleTask(index, isChecked) {
    const doc = cmEditor.getDoc();
    const content = doc.getValue();
    let matchCount = 0;

    // Regex to find task list items: - [ ] or - [x]
    // We need to match line by line to preserve location
    const lines = content.split('\n');
    let newLines = [...lines];

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Matches "- [ ]", "* [ ]", "+ [ ]" with optional whitespace
        const taskRegex = /^(\s*[-*+]\s+\[)([ xX])(\])(.*)$/;
        const match = line.match(taskRegex);

        if (match) {
            if (matchCount === index) {
                // Found the target task
                const newMark = isChecked ? 'x' : ' ';
                // Reconstruct line: prefix + mark + suffix + rest
                newLines[i] = `${match[1]}${newMark}${match[3]}${match[4]}`;

                const cursor = doc.getCursor();
                doc.setValue(newLines.join('\n'));
                doc.setCursor(cursor);
                return;
            }
            matchCount++;
        }
    }
}

function syncEditor(text) {
    const cleanText = text.trim();
    if (!cleanText) return;

    // Simple search
    const content = cmEditor.getValue();
    const index = content.indexOf(cleanText);

    if (index !== -1) {
        const pos = cmEditor.posFromIndex(index);
        cmEditor.setSelection(pos, cmEditor.posFromIndex(index + cleanText.length));
        cmEditor.scrollIntoView(pos, 200);

        const editorPane = document.querySelector('.editor-pane');
        if (editorPane.style.display === 'none') {
            setViewMode('split');
        }
        cmEditor.focus();
    }
}

// Auto-save to LocalStorage
const savedContent = localStorage.getItem('ivy_markdown_content');
if (savedContent) {
    cmEditor.setValue(savedContent);
}

cmEditor.on('change', () => {
    if (localStorage.getItem('ivy_autosave') !== 'false') {
        localStorage.setItem('ivy_markdown_content', cmEditor.getValue());
    }
});

// Resizer Logic
const resizer = document.getElementById('resizer');
const editorPane = document.querySelector('.editor-pane');
const previewPane = document.querySelector('.preview-container');
const container = document.querySelector('.container'); // Or main

let isResizing = false;

if (resizer) {
    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizer.classList.add('resizing');
        document.body.style.cursor = 'col-resize';
        // Disable pointer events on iframes/preview to prevent capturing mouse
        previewPane.style.pointerEvents = 'none';
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;

        const containerWidth = document.querySelector('main').offsetWidth;
        const x = e.clientX;

        // Calculate percentage
        // We need to account for the sidebar or margins if any. 
        // Assuming main takes full width.

        const newEditorWidth = (x / containerWidth) * 100;

        // Limits
        if (newEditorWidth > 10 && newEditorWidth < 90) {
            editorPane.style.flex = `0 0 ${newEditorWidth}%`;
            previewPane.style.flex = `1`; // Take remaining space
        }
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizer.classList.remove('resizing');
            document.body.style.cursor = 'default';
            previewPane.style.pointerEvents = 'auto';
            if (cmEditor) cmEditor.refresh();
        }
    });
}

// Heading Functions
function changeHeading(type) {
    const doc = cmEditor.getDoc();
    const cursor = doc.getCursor();
    const lineContent = doc.getLine(cursor.line);

    // Regex to match existing headings (#, ##, ###)
    const headingRegex = /^(#{1,6})\s+(.*)$/;
    const match = lineContent.match(headingRegex);

    let cleanText = lineContent;
    if (match) {
        cleanText = match[2]; // Text without heading markers
    }

    let newContent = cleanText;
    if (type === 'h1') newContent = `# ${cleanText}`;
    else if (type === 'h2') newContent = `## ${cleanText}`;
    else if (type === 'h3') newContent = `### ${cleanText}`;
    // 'p' or 'normal' just leaves it as cleanText

    doc.replaceRange(newContent, { line: cursor.line, ch: 0 }, { line: cursor.line, ch: lineContent.length });
    cmEditor.focus();
}

function updateHeadingDropdown() {
    const doc = cmEditor.getDoc();
    const cursor = doc.getCursor();
    const lineContent = doc.getLine(cursor.line);
    const select = document.getElementById('heading-select');

    if (!select) return;

    if (lineContent.startsWith('### ')) {
        select.value = 'h3';
    } else if (lineContent.startsWith('## ')) {
        select.value = 'h2';
    } else if (lineContent.startsWith('# ')) {
        select.value = 'h1';
    } else {
        select.value = 'p';
    }
}

// Add cursor activity listener to update dropdown
cmEditor.on('cursorActivity', updateHeadingDropdown);

// Drag and Drop Logic
const dragOverlay = document.getElementById('drag-overlay');
const dragTitle = document.getElementById('drag-title');
const dragDesc = document.getElementById('drag-desc');
const dragIcon = document.querySelector('.drag-icon');
const dragLoader = document.getElementById('drag-loader');
let dragCounter = 0;

// Prevent default drag behaviors
['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
    document.body.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

// Highlight drop area
['dragenter', 'dragover'].forEach(eventName => {
    document.body.addEventListener(eventName, highlight, false);
});

['dragleave', 'drop'].forEach(eventName => {
    document.body.addEventListener(eventName, unhighlight, false);
});

function highlight(e) {
    dragCounter++;
    if (dragCounter === 1) {
        dragOverlay.classList.add('active');
        resetDragUI();
    }
}

function unhighlight(e) {
    dragCounter--;
    if (dragCounter === 0) {
        // Only hide if we haven't dropped (drop handles its own hiding logic)
        if (e.type !== 'drop') {
            dragOverlay.classList.remove('active');
        }
    }
}

// Handle dropped files
document.body.addEventListener('drop', handleDrop, false);

function handleDrop(e) {
    const dt = e.dataTransfer;
    const files = dt.files;

    if (files.length > 0) {
        handleFiles(files);
    } else {
        dragOverlay.classList.remove('active');
        dragCounter = 0;
    }
}

function resetDragUI() {
    dragOverlay.classList.remove('error');
    dragTitle.textContent = 'Drop to Import';
    dragDesc.textContent = 'Accepted files: .md, .txt, .pdf, .docx';
    dragIcon.textContent = 'cloud_upload';
    dragIcon.style.color = '';
    dragLoader.style.display = 'none';
}

function showDragError(message) {
    dragOverlay.classList.add('error');
    dragTitle.textContent = 'Invalid File';
    dragDesc.textContent = message;
    dragIcon.textContent = 'error_outline';

    setTimeout(() => {
        dragOverlay.classList.remove('active');
        dragOverlay.classList.remove('error');
        dragCounter = 0;
    }, 1500);
}

function showDragLoading(message) {
    dragTitle.textContent = 'Converting...';
    dragDesc.textContent = message;
    dragLoader.style.display = 'block';
    dragIcon.style.display = 'none';
}

function handleFiles(files) {
    const file = files[0];
    const ext = file.name.split('.').pop().toLowerCase();

    if (['md', 'txt', 'pdf', 'docx'].includes(ext)) {
        showDragLoading(`Processing ${file.name}...`);

        if (ext === 'md' || ext === 'txt') {
            readTextFile(file);
        } else if (ext === 'pdf') {
            convertPDF(file);
        } else if (ext === 'docx') {
            convertDocx(file);
        }
    } else {
        showDragError('Only .md, .txt, .pdf, and .docx files are supported.');
    }
}

function readTextFile(file) {
    const reader = new FileReader();
    reader.onload = function (e) {
        insertImportedText(e.target.result);
    };
    reader.readAsText(file);
}

async function convertPDF(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        let fullText = '';

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += `\n\n<!-- Page ${i} -->\n\n${pageText}`;
        }

        insertImportedText(fullText);
    } catch (e) {
        console.error(e);
        showDragError('Failed to parse PDF.');
    }
}

async function convertDocx(file) {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.convertToHtml({ arrayBuffer: arrayBuffer });
        const html = result.value;

        // Convert HTML to Markdown using Turndown
        const turndownService = new TurndownService({
            headingStyle: 'atx',
            codeBlockStyle: 'fenced'
        });
        const markdown = turndownService.turndown(html);

        insertImportedText(markdown);
    } catch (e) {
        console.error(e);
        showDragError('Failed to parse Word document.');
    }
}

function insertImportedText(text) {
    // Animate success
    dragTitle.textContent = 'Success!';
    dragDesc.textContent = 'File imported successfully.';
    dragLoader.style.display = 'none';
    dragIcon.style.display = 'block';
    dragIcon.textContent = 'check_circle';
    dragIcon.style.color = '#4caf50';

    setTimeout(() => {
        dragOverlay.classList.remove('active');
        dragCounter = 0;

        // Insert text
        const doc = cmEditor.getDoc();
        // Optional: Append or Replace? Usually import implies replace or append. 
        // Let's append to end for safety, or replace if empty.
        if (cmEditor.getValue().trim() === '') {
            cmEditor.setValue(text);
            // If we just imported into an empty doc, treat it as a fresh start (unmodified)
            // unless the user edits it.
            const currentDoc = documents.find(d => d.id === activeDocId);
            if (currentDoc) {
                currentDoc.modified = false;
                renderTabs();
            }
        } else {
            const cursor = doc.getCursor();
            doc.replaceRange('\n\n' + text, cursor);
        }

        triggerConfetti();
    }, 800);
}

// Desmos Modal Logic
let desmosCalculatorInstance = null;
const desmosModal = document.getElementById('desmos-modal');

function openDesmosModal() {
    desmosModal.style.display = 'block';

    // Initialize Desmos if not already done
    if (!desmosCalculatorInstance && typeof Desmos !== 'undefined') {
        const container = document.getElementById('desmos-editor-container');
        desmosCalculatorInstance = Desmos.GraphingCalculator(container, {
            keypad: true,
            expressions: true,
            settingsMenu: true,
            zoomButtons: true
        });
    } else if (desmosCalculatorInstance) {
        // Resize to fit modal
        desmosCalculatorInstance.resize();
    }
}

function closeDesmosModal() {
    desmosModal.style.display = 'none';
}

function insertDesmosGraph() {
    if (!desmosCalculatorInstance) return;

    const state = desmosCalculatorInstance.getState();
    const stateStr = JSON.stringify(state);

    const preset = document.getElementById('desmos-preset').value;

    let config = {
        expressions: false,
        lockViewport: false,
        settingsMenu: false,
        zoomButtons: true,
        keypad: false
    };

    if (preset === 'split') {
        config.expressions = true;
        config.keypad = true;
    } else if (preset === 'static') {
        config.lockViewport = true;
        config.zoomButtons = false;
        config.settingsMenu = false;
        config.expressions = false;
    }

    const configStr = JSON.stringify(config);

    const code = `\`\`\`desmos
//config: ${configStr}
//state:${stateStr}
\`\`\``;

    insertTemplateCode(code);
    closeDesmosModal();
}