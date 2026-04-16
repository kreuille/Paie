const { PDFParse } = require('pdf-parse');
const fs = require('fs');
const buf = fs.readFileSync('test_fiches_paie.pdf');
const parser = new PDFParse();
parser.parse(buf).then(d => {
  console.log('SUCCESS - Pages:', d.numpages);
  console.log('Text:', JSON.stringify(d.text.substring(0, 600)));
}).catch(e => {
  console.error('Error:', e.message.substring(0, 200));
});
