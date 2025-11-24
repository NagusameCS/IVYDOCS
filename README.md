# IVYSTUDY Markdown Editor

This is a local Markdown editor with support for:
- **Chart.js**: Create bar, line, pie, and doughnut charts.
- **Mermaid.js**: Create flowcharts, sequence diagrams, class diagrams, etc.
- **Desmos**: Create interactive graphing calculator plots.
- **Math**: Render LaTeX math equations using KaTeX.
- **Standard Markdown**: Headers, lists, code blocks, etc.

## How to Use

1.  **Open `index.html`** in your web browser.
    *   You can simply double-click the file in your file explorer.
    *   Or, for the best experience (to avoid any local file security restrictions), run a simple local server.

    **Using Python (if installed):**
    ```bash
    cd editor
    python3 -m http.server
    ```
    Then open `http://localhost:8000` in your browser.

    **Using VS Code:**
    *   Install the "Live Server" extension.
    *   Right-click `index.html` and select "Open with Live Server".

2.  **Write Markdown** in the left pane.
3.  **View the result** in the right pane.
4.  **Use the Toolbar** at the top to quickly insert templates for charts, diagrams, and math.

## Syntax Guide

### Charts
Use the `chart` code block with a JSON configuration.
```markdown
\`\`\`chart
{
    "type": "bar",
    "data": { ... }
}
\`\`\`
```

### Mermaid Diagrams
Use the `mermaid` code block.
```markdown
\`\`\`mermaid
graph TD
    A --> B
\`\`\`
```

### Desmos Graphs
Use the `desmos` code block. You can optionally add a config object in a comment.
```markdown
\`\`\`desmos
//config: {"bounds": {"x": [-10, 10], "y": [-10, 10]}}
y=x^2
\`\`\`
```

### Math
Use `$` for inline math and `$$` for display math.
```markdown
$E=mc^2$

$$
\int_0^\infty x^2 dx
$$
```
