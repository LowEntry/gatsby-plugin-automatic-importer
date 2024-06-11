# gatsby-plugin-automatic-importer

Automates the import statements in your project.


## Description

Tired of manually managing your import statements? To have to constantly rework your project whenever you move or rename a file?

This plugin will automatically generate an import statements file, and also automatically includes it in your project's files.

This completely automates handling your imports.


### Example

For example, lets say you have a project with several `.less`, `.js` and `.jsx` files. After having set up the plugin, it will generate this file automatically (at `/imports.js`):

```javascript
import './src/resources/css/components/your-code.less';
import './src/resources/css/libs/common-functions.less';
import './src/resources/css/libs/inputfield-transparent-background.less';
import './src/resources/css/libs/swipedown-refresh-disabler.less';
import './src/resources/css/libs/text-selection-disabler.less';
import {App} from './src/resources/js/components/App.jsx';
import {AppTimer} from './src/resources/js/components/AppTimer.jsx';
import {stateTimer} from './src/resources/js/state/timer.js';

export {App, AppTimer, stateTimer};
```

It will also automatically import this in your project files. So for example, in `/src/resources/js/components/App.jsx`, it will now have this at the top:

```javascript
import {AppTimer, stateTimer} from './../../../../imports.js';
```

This completely automates your imports, and makes it much easier to move and rename your files.

Notice that in this example, `App` is not imported, as that's defined in this file. But `AppTimer` and `stateTimer` are imported, as they are defined in other files. This is all done automatically.


## Usage

Add the plugin to your `gatsby-config.mjs` file:

```javascript
const config = {
  // ...
  plugins:[
    // ...
    {
      resolve:'gatsby-plugin-automatic-importer',
      options:{
        'import':[
          './src/resources/',
        ],
        'modify':[
          './src/resources/',
          './src/pages/',
        ],
      },
    },
  ],
};
export default config;
```

- the `import` array is for files (and folders) which will be added to your imports file.
- the `modify` array is for files (and folders) which will be modified to automatically import everything.


## Additional imports

For importing anything other than files and folders (such as plugins and libraries), you can add a file to your project that imports them, for example:

```javascript
import * as React from 'react';

import * as MaterialUI from '@mui/material';
import * as MaterialUILab from '@mui/lab';

import * as ReactDnd from 'react-dnd';


export {React, ReactDnd};
export const MUI = {...MaterialUI, Lab:MaterialUILab};
```

Note that this will mess up tree shaking, so it's best to only use this for things that are actually used in your project. Or when you're still prototyping and just want to move fast, and don't care about optimizations and efficiency yet.


## All plugin options

This plugin provides you the capabilities to add support for additional file extensions and types, as well as to add custom import logic to support your project's needs.

The options are:

- `import`: the files and folders that will be added to your imports file
- `modify`: the files and folders that will be modified to automatically import everything
- `filter`: a function that allows you to filter the files that will be included
- `babel`: additional babel plugins that will be used to parse your code
- `outputName`: the name of the file to which the import statements will be written
- `previousOutputNames`: the names of the files that you used previously as the `outputName`, so that old import lines will be correctly purged/deleted from your `modify` files
- `fileExtensionsJs`: the file extensions that will be treated as javascript
- `fileExtensionsOther`: the file extensions that will simply be included
- `fileExtensionsCustom`: a function that allows you to create your own custom import logic


### Example:

```javascript
const config = {
  // ...
  plugins:[
    // ...
    {
      resolve:'gatsby-plugin-automatic-importer',
      options:{
        'import':[
            // the files and folders that will be added to your imports file
            './src/components/',
            './src/state/',
            './src/css/',
          ],
        
        'modify':[
            // the files and folders that will be modified to automatically import everything
            './src/components/',
            './src/state/',
            './src/pages/',
          ],
        
        'filter':
          (file) => {
            // return true to include the file, or false to exclude it
            // PS: to simply filter on file extensions, you can use the 'fileExtensionsJs' and 'fileExtensionsOther' arrays
            return true;
          },
        
        'babel':{
            'plugins':[
                // when your code can't be parsed by babel, you can add additional plugins here
                '@babel/plugin-proposal-class-properties',
                '@babel/plugin-proposal-private-methods',
              ],
          },
        
        'outputName':
          'imports.js', // the name of the file to which the import statements will be written
        
        'previousOutputNames':[
            // the names of the files that you used previously as the 'outputName', 
            //  so that old import lines will be correctly purged/deleted from your 'modify' files
            // PS: this array can safely contain the current 'outputName' as well, but it's not necessary
          ],
        
        'fileExtensionsJs':[
            // the file extensions that will be treated as javascript, 
            //  meaning they will be parsed and their exports will be added (if the file is in the 'import' array), 
            //  and they will be modified to automatically import everything (if the file is in the 'modify' array)
            'js',
            'jsx',
          ],
        
        'fileExtensionsOther':[
            // the file extensions that will simply be included (if the file is in the 'import' array), 
            //  they won't be parsed, nor will they be modified
            'css',
            'less',
            'sass',
            'scss',
          ],
        
        'fileExtensionsCustom':
          (file) => {
            // this function allows you to create your own custom import logic
            if(file.toLowerCase().endsWith('.ts') || file.toLowerCase().endsWith('.tsx')) {
              // to read the content of the file, you can do:  const content = fs.readFileSync(file, 'utf8');
              return {
                code:   `import {a, b, c} from '${file}';`, // the import statement (this will be added to the imports file)
                exports:['a', 'b', 'c'], // the fields that this file exports (they will automatically be imported in the 'modify' files)
              };
            }
          },
      },
    },
  ],
};
export default config;
```


## Final words

I hope this plugin will be useful to you. If you have any questions or suggestions, please feel free to get in touch at [LowEntry.com](https://lowentry.com/).
