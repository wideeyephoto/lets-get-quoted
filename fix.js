const fs = require('fs');
const path = 'src/app/dashboard/sites/tabs/BuilderPageTab.tsx';
let content = fs.readFileSync(path, 'utf8');
content = content.replace(/                                  <div className=\{styles\.formField\}>\r?\n                                    <label htmlFor="elfsightWidgetId">/, `                                    )}
                                  </div>
                                  <div className={styles.formField}>
                                    <label htmlFor="elfsightWidgetId">`);
fs.writeFileSync(path, content);
