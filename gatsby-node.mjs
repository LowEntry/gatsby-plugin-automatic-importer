import fs from 'fs';
import babel from '@babel/core';


export const pluginOptionsSchema = ({Joi}) =>
{
	return Joi.object({
		import:              Joi.array().items(Joi.string())
			                     .default([])
			                     .description(`A list of files and folders, which will be included in the imports/exports generation.`),
		modify:              Joi.array().items(Joi.string())
			                     .default([])
			                     .description(`A list of files and folders, which will be updated to automatically import everything that has been exported.`),
		filter:              Joi.function().minArity(1)
			                     .default(null)
			                     .description(`A function that can be used to filter the files and folders that will be included in the imports/exports generation.`),
		outputName:          Joi.string()
			                     .allow(null)
			                     .default('imports.js')
			                     .description(`The name of the file that will be generated, this file will contain the import lines.`),
		previousOutputNames: Joi.array().items(Joi.string())
			                     .default([])
			                     .description(`The previously-used names of the output files, this is needed to be able to clean them up.`),
		babel:               Joi.object()
			                     .default({})
			                     .description(`The babel options to use when parsing the files (the files need to be parsed to detect what fields they export).`),
		fileExtensionsJs:    Joi.array().items(Joi.string())
			                     .default(['js', 'jsx'])
			                     .description(`The file extensions to consider as JavaScript files.`),
		fileExtensionsOther: Joi.array().items(Joi.string())
			                     .default(['css', 'less', 'sass', 'scss'])
			                     .description(`The file extensions to consider as importable files.`),
		fileExtensionsCustom:Joi.function().minArity(1)
			                     .default(null)
			                     .description(`A function that can be used to handle custom file extensions. It should return {code, exports}, with code being the import line, and exports being an array of exported fields.`),
	});
};


function purgePath(path)
{
	path = (path + '').replace(/\\/g, '/');
	while(path.endsWith('/'))
	{
		path = path.substring(0, path.length - 1);
	}
	return path;
}

function getAllFiles(path, allFilesList = [])
{
	try
	{
		if(!fs.existsSync(path))
		{
			console.warn('[gatsby-plugin-automatic-importer] Path does not exist:', path);
		}
		else
		{
			const stats = fs.statSync(path);
			if(stats.isDirectory())
			{
				const files = fs.readdirSync(path);
				files.forEach(file =>
				{
					getAllFiles(path + '/' + file, allFilesList);
				});
			}
			else if(stats.isFile())
			{
				allFilesList.push(path);
			}
		}
	}
	catch(e)
	{
		console.error(e);
	}
	return allFilesList;
}


function isFileOfType(file, types)
{
	const f = file.toLowerCase();
	return types.some(type => f.endsWith(type.startsWith('.') ? type : '.' + type));
}


function compareFileOrder(a, b)
{
	return _compareFileOrderArray(a.split('/'), b.split('/'));
}

function _compareFileOrderArray(aParts, bParts)
{
	for(let i = 0; i < Math.min(aParts.length, bParts.length); i++)
	{
		const cmp = _compareFileOrderString(aParts[i], bParts[i]);
		if(cmp !== 0)
		{
			return cmp;
		}
	}
	return aParts.length - bParts.length;
}

function _compareFileOrderString(a, b)
{
	const aa = a.toLowerCase();
	const bb = b.toLowerCase();
	if(aa > bb)
	{
		return 1;
	}
	else if(aa === bb)
	{
		return 0;
	}
	return -1;
}


function stringIncludesAny(string, substrings)
{
	let includes = false;
	substrings.forEach(substring =>
	{
		if(!includes)
		{
			includes = string.includes(substring);
		}
	});
	return includes;
}

function getFirstCodeLine(code)
{
	const firstLine = code.indexOf(';');
	return ((firstLine >= 0) ? code.substring(0, firstLine) : code).trim();
}

const regexStartsWithImport = /^\s*import\s*{/i;
function getFirstImportStatement(code)
{
	if(!regexStartsWithImport.test(code))
	{
		return '';
	}
	return code.substring(0, code.indexOf(';') + 1);
}


function setFileContentIfDifferent(file, newContent, oldContent = null)
{
	if(oldContent === null)
	{
		try
		{
			oldContent = fs.readFileSync(file, 'utf8');
		}
		catch(e)
		{
			oldContent = '';
		}
	}
	
	if(oldContent.trim() !== newContent.trim())
	{
		fs.writeFileSync(file, newContent);
	}
}

function setFileContentIfFirstCodeLineIsDifferent(file, newContent, oldContent = null)
{
	if(oldContent === null)
	{
		try
		{
			oldContent = fs.readFileSync(file, 'utf8');
		}
		catch(e)
		{
			oldContent = '';
		}
	}
	
	if(getFirstCodeLine(oldContent) !== getFirstCodeLine(newContent))
	{
		fs.writeFileSync(file, newContent);
	}
}


function purgeOutputName(name)
{
	if(name === null)
	{
		return null;
	}
	name = purgePath(name);
	if(!name.endsWith('.js'))
	{
		name += '.js';
	}
	const parts = name.split('/');
	return parts[parts.length - 1];
}


export const onPreInit = ({reporter}, pluginOptions) =>
{
	const outputName = purgeOutputName(pluginOptions['outputName']);
	const previousOutputNames = (pluginOptions['previousOutputNames']).map(purgeOutputName);
	const possibleImportLines = [...((outputName !== null) ? [outputName] : []), ...previousOutputNames].map(path => `./${path}';`);
	
	
	function getExportedFields(code, codeIsPurged = false)
	{
		try
		{
			const {ast} = babel.transformSync(codeIsPurged ? code : purgeImportedFieldsCode(code), {
				ast:      true,
				code:     false,
				plugins:  ['@babel/plugin-syntax-jsx'],
				overrides:[
					pluginOptions['babel'],
				],
			});
			
			//fs.writeFileSync('./test.json', JSON.stringify(ast?.program?.body ?? [], null, 2));
			return (ast?.program?.body ?? []).filter(node => node.type === 'ExportNamedDeclaration')
				.map(exportNode =>
				{
					const specifiers = exportNode.specifiers?.map(spec => spec?.exported?.name) ?? [];
					const declarations = exportNode.declaration?.declarations?.map(decl => decl?.id?.name) ?? [];
					const declarationsArray = exportNode.declaration?.declarations?.map(decl => decl?.id?.elements?.map(elem => elem?.name) ?? [])?.flatMap(x => x) ?? [];
					const declarationsObject = exportNode.declaration?.declarations?.map(decl => decl?.id?.properties?.map(prop => prop?.value?.name) ?? [])?.flatMap(x => x) ?? [];
					return [...specifiers, ...declarations, ...declarationsArray, ...declarationsObject];
				})
				.flatMap(x => x)
				.filter(x => (typeof x !== 'undefined') && ((!Array.isArray(x) || x.length > 0)));
		}
		catch(e)
		{
			console.error(e);
			return [];
		}
	}
	
	function containsOurImportStatement(code)
	{
		return stringIncludesAny(code, possibleImportLines);
	}
	
	function purgeImportedFieldsCode(code)
	{
		let changed = true;
		while(changed)
		{
			changed = false;
			
			const newCode = code.trimStart();
			const firstImportStatement = getFirstImportStatement(newCode);
			
			if(containsOurImportStatement(firstImportStatement))
			{
				const importStatementEnd = newCode.indexOf('\n', firstImportStatement.length);
				code = (importStatementEnd < 0) ? '' : newCode.substring(importStatementEnd + 1);
				changed = true;
				continue;
			}
			
			if(newCode.startsWith('<<<<<<< HEAD'))
			{
				const headStartA = newCode.indexOf('\n') + 1;
				if(headStartA >= 1)
				{
					const headEndA = newCode.indexOf('=======', headStartA);
					if(headEndA >= 0)
					{
						const headA = newCode.substring(headStartA, headEndA).trim();
						
						const headStartB = newCode.indexOf('\n', headEndA) + 1;
						if(headStartB >= 1)
						{
							const headEndB = newCode.indexOf('>>>>>>>', headStartB);
							if(headEndB >= 0)
							{
								const headB = newCode.substring(headStartB, headEndB).trim();
								
								if(containsOurImportStatement(headA) && containsOurImportStatement(headB))
								{
									const headEnd = newCode.indexOf('\n', headEndB) + 1;
									code = newCode.substring(headEnd);
									changed = true;
									continue;
								}
							}
						}
					}
				}
			}
		}
		return code;
	}
	
	
	let importsCode = '';
	let exportedFields = {};
	
	
	function filter(file)
	{
		if(typeof pluginOptions['filter'] === 'function')
		{
			return !!pluginOptions['filter'](file, ...arguments);
		}
		return true;
	}
	
	function importFile(file)
	{
		if((outputName !== null) && isFileOfType(file, pluginOptions['fileExtensionsJs']))
		{
			if(filter(file))
			{
				const fields = getExportedFields(fs.readFileSync(file, 'utf8'));
				importsCode += `import {${fields.join(', ')}} from '${file}';\n`;
				fields.forEach(field => exportedFields[field] = true);
			}
		}
		else if((outputName !== null) && isFileOfType(file, pluginOptions['fileExtensionsOther']))
		{
			if(filter(file))
			{
				importsCode += `import '${file}';\n`;
			}
		}
		else if(typeof pluginOptions['fileExtensionsCustom'] === 'function')
		{
			if(filter(file))
			{
				const result = pluginOptions['fileExtensionsCustom'](file, ...arguments);
				if(result?.code)
				{
					importsCode += `${result.code}'\n`;
				}
				if(result?.exports && Array.isArray(result?.exports))
				{
					result.exports.forEach(field => exportedFields[field] = true);
				}
			}
		}
	}
	
	const regexImportReplacer = /^(\s*import\s*{\s*)[^}]*([\S,]\s*}\s*from\s*['"]).*(['"]\s*;[\s\S]*)/i;
	function modifyFile(file)
	{
		if(isFileOfType(file, pluginOptions['fileExtensionsJs']))
		{
			const code = fs.readFileSync(file, 'utf8');
			const purgedCode = purgeImportedFieldsCode(code);
			
			if(outputName === null)
			{
				setFileContentIfFirstCodeLineIsDifferent(file, purgedCode, code);
				return;
			}
			
			const fields = getExportedFields(purgedCode, true);
			const levelsDeep = file.split('/').length - 2;
			const importLineFields = Object.keys(exportedFields).filter(value => !fields.includes(value)).join(', ');
			const importLineFrom = './' + '../'.repeat(levelsDeep) + outputName;
			let newImportLine = `import {${importLineFields}} from '${importLineFrom}';`;
			
			const firstImportStatement = getFirstImportStatement(code);
			if(firstImportStatement && containsOurImportStatement(firstImportStatement) && regexImportReplacer.test(firstImportStatement))
			{
				newImportLine = firstImportStatement.replace(regexImportReplacer, (match, p1, p2, p3) =>
				{
					if(!p2.startsWith(','))
					{
						p2 = p2.substring(1);
					}
					return p1 + importLineFields + p2 + importLineFrom + p3;
				});
			}
			
			const newCode = newImportLine + '\n' + purgedCode;
			setFileContentIfFirstCodeLineIsDifferent(file, newCode, code);
		}
	}
	
	
	pluginOptions['import']?.forEach(path => getAllFiles(purgePath(path)).sort(compareFileOrder).forEach(importFile));
	if(outputName !== null)
	{
		setFileContentIfDifferent('./' + outputName, `${importsCode}\nexport {${Object.keys(exportedFields).join(', ')}};\n`);
	}
	pluginOptions['modify']?.forEach(path => getAllFiles(purgePath(path)).sort(compareFileOrder).forEach(modifyFile));
};
export const onPreExtractQueries = onPreInit;
