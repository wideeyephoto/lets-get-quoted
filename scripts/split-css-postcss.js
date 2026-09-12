const fs = require('fs');
const postcss = require('postcss');

const cssPath = 'src/lib/templates/themes.module.css';
const css = fs.readFileSync(cssPath, 'utf8');

const themes = ['forge', 'guild', 'vista', 'handy', 'coat', 'fixit', 'reno', 'shine'];

const root = postcss.parse(css);

const themeRoots = {};
themes.forEach(t => {
  themeRoots[t] = postcss.root();
});

const sharedRoot = postcss.root();

// We need to iterate over all nodes in the root.
// If it's a rule, we check its selectors.
// If all its selectors start with a theme class (e.g. .forge), we move it to that theme.
// If some do and some don't, we'd have to split it. But the plan says "cleanly separable", so hopefully it's one rule per theme or all selectors in a rule belong to the same theme.
// What about @media rules? If an @media rule contains only rules for a specific theme, we move the @media rule.
// We can just walk the children.

function classifyNode(node) {
  if (node.type === 'rule') {
    let assignedTheme = null;
    let isShared = false;
    
    node.selectors.forEach(sel => {
      let matchedTheme = null;
      for (const t of themes) {
        // match `.theme` or `.theme ` or `.theme:` etc.
        // The themes are exactly the class names, e.g. `.forge`
        if (sel.startsWith(`.${t}`) && (sel.length === t.length + 1 || !/[a-zA-Z0-9_-]/.test(sel[t.length + 1]))) {
          matchedTheme = t;
          break;
        }
      }
      
      if (matchedTheme) {
        if (assignedTheme && assignedTheme !== matchedTheme) {
          isShared = true; // mix of themes? Shouldn't happen based on the prompt, but just in case.
        } else {
          assignedTheme = matchedTheme;
        }
      } else {
        isShared = true;
      }
    });
    
    if (isShared || !assignedTheme) return 'shared';
    return assignedTheme;
  } else if (node.type === 'atrule') {
    // Check all its child rules
    let assignedTheme = null;
    let isShared = false;
    
    if (node.nodes) {
      node.nodes.forEach(child => {
        const t = classifyNode(child);
        if (t === 'shared') {
          isShared = true;
        } else {
          if (assignedTheme && assignedTheme !== t) isShared = true;
          else assignedTheme = t;
        }
      });
    }
    
    if (isShared || !assignedTheme) return 'shared';
    return assignedTheme;
  }
  
  return 'shared'; // Comments, etc. at top level go to shared
}

// We will clone the nodes so we can safely mutate/extract.
// Wait, actually, we can just process them and append to the corresponding root.

root.nodes.forEach(node => {
  const theme = classifyNode(node);
  if (theme === 'shared') {
    sharedRoot.append(node.clone());
  } else {
    // If it's an atrule that belongs to a theme, we just append it
    themeRoots[theme].append(node.clone());
  }
});

// Write out the files
fs.writeFileSync('src/lib/templates/shared.module.css', sharedRoot.toString());
console.log(`Wrote shared.module.css`);

themes.forEach(t => {
  const code = themeRoots[t].toString();
  if (code.trim().length > 0) {
    fs.writeFileSync(`src/lib/templates/${t}.module.css`, code);
    console.log(`Wrote ${t}.module.css`);
  }
});
