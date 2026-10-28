// Tests for shared/lobby-link.mjs: reading a table code from a shared link, and building the link.
import { codeFromPath, linkForCode } from '../shared/lobby-link.mjs';
import { makeTableCode, isValidCode } from '../shared/table-code.mjs';

let checks = 0;
const same = (label, actual, expected) => {
  checks++;
  if (actual !== expected) { console.log(`FAILED CHECK: ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); process.exit(1); }
};

// Links that carry a valid code
same('a plain link', codeFromPath('/lobby/ABC234'), 'ABC234');
same('a trailing slash', codeFromPath('/lobby/ABC234/'), 'ABC234');
same('lower case is accepted and upper-cased', codeFromPath('/lobby/abc234'), 'ABC234');
same('a dash in the middle (how people type it)', codeFromPath('/lobby/ABC-234'), 'ABC234');
same('an encoded space around the code', codeFromPath('/lobby/%20ABC234%20'), 'ABC234');
same('an encoded letter', codeFromPath('/lobby/%41BC234'), 'ABC234');
same('the first and last characters of the alphabet', codeFromPath('/lobby/A2Z9ZA'), 'A2Z9ZA');

// Things that are not a table link at all
same('the site root', codeFromPath('/'), null);
same('the lobby page with no code', codeFromPath('/lobby'), null);
same('the lobby page with an empty code', codeFromPath('/lobby/'), null);
same('the page file itself', codeFromPath('/pages/lobby/index.html'), null);
same('the page directory', codeFromPath('/pages/lobby/'), null);
same('a different first segment', codeFromPath('/table/ABC234'), null);
same('a prefix before /lobby', codeFromPath('/x/lobby/ABC234'), null);
same('the first segment in capitals', codeFromPath('/Lobby/ABC234'), null);
same('an extra segment after the code', codeFromPath('/lobby/ABC234/extra'), null);
same('a query string is not part of the path (a caller passing one gets nothing)', codeFromPath('/lobby/ABC234?x=1'), null);

// Codes that look right and are not
same('too short', codeFromPath('/lobby/ABC23'), null);
same('too long', codeFromPath('/lobby/ABC2345'), null);
same('a zero (not in the alphabet)', codeFromPath('/lobby/ABC230'), null);
same('a letter O', codeFromPath('/lobby/ABCO34'), null);
same('a one', codeFromPath('/lobby/ABC231'), null);
same('a letter I', codeFromPath('/lobby/ABCI34'), null);
same('a symbol', codeFromPath('/lobby/ABC23!'), null);
same('a broken percent escape', codeFromPath('/lobby/%E0%A4%A'), null);
same('an encoded slash cannot smuggle a second segment', codeFromPath('/lobby/ABC%2F234'), null);
same('an encoded null character', codeFromPath('/lobby/ABC23%00'), null);
same('markup in the code', codeFromPath('/lobby/%3Cscript%3E'), null);
same('only dashes and spaces', codeFromPath('/lobby/-%20-'), null);

// Not a string
same('undefined', codeFromPath(undefined), null);
same('null', codeFromPath(null), null);
same('a number', codeFromPath(234), null);

// Every code the generator can make survives a trip through a link
for (let i = 0; i < 2000; i++) {
  const code = makeTableCode();
  same(`a generated code ${code} round-trips`, codeFromPath(linkForCode('https://example.test', code).replace('https://example.test', '')), code);
}
same('the generated codes are valid (so the loop above tested real codes)', isValidCode(makeTableCode()), true);

// Building a link
same('the link for a code', linkForCode('https://overloaded.example', 'ABC234'), 'https://overloaded.example/lobby/ABC234');
same('a link keeps a port', linkForCode('http://localhost:5173', 'ABC234'), 'http://localhost:5173/lobby/ABC234');

console.log(`All ${checks} lobby link checks passed.`);
