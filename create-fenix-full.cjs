const fs = require('fs');
const path = require('path');

// FENIX BLOOM (10 colors) - Copy from Solid Colors + Bloom
const bloomMaterials = [
  { code: '789', name: 'rosso-namib', textureFile: '0789-rosso-namib.svg', hex: '#9A4635', price: 2900 },
  { code: '790', name: 'viola-orissa', textureFile: '0790-viola-orissa.svg', hex: '#2E272C', price: 2950 },
  { code: '771', name: 'azzurro-naxos', textureFile: '0771-azzurro-naxos.svg', hex: '#526372', price: 2600 },
  { code: '770', name: 'rosso-askja', textureFile: '0770-rosso-askja.svg', hex: '#674445', price: 2750 },
  { code: '791', name: 'giallo-evora', textureFile: '0791-giallo-evora.svg', hex: '#C48D63', price: 2800 },
  { code: '792', name: 'blu-shaba', textureFile: '0792-blu-shaba.svg', hex: '#2B3842', price: 2650 },
  { code: '773', name: 'verde-brac', textureFile: '0773-verde-brac.svg', hex: '#566A5D', price: 2700 },
  { code: '772', name: 'giallo-kashmir', textureFile: '0772-giallo-kashmir.svg', hex: '#CC9E50', price: 2750 },
  { code: '793', name: 'grigio-aragona', textureFile: '0793-grigio-aragona.svg', hex: '#413D3B', price: 2450 },
  { code: '794', name: 'verde-kitami', textureFile: '0794-verde-kitami.svg', hex: '#8C958C', price: 2500 },
];

// FENIX NTM (12 colors from user data + 2 bloom) - Copy from existing NTM or create new
const ntmMaterials = [
  { code: '0757', name: 'bianco-dover', textureFile: '0757-bianco-dover.svg', hex: '#F5F5F5', price: 3100 },
  { code: '0030', name: 'bianco-alaska', textureFile: '0030-bianco-alaska.svg', hex: '#FFFFFF', price: 3200 },
  { code: '0032', name: 'bianco-kos', textureFile: '0032-bianco-kos.svg', hex: '#F2F2F2', price: 3000 },
  { code: '0029', name: 'bianco-male', textureFile: '0029-bianco-male.svg', hex: '#F9F6EF', price: 3050 },
  { code: '0719', name: 'beige-luxor', textureFile: '0719-beige-luxor.svg', hex: '#D5C7B6', price: 2700 },
  { code: '0717', name: 'castoro-ottawa', textureFile: '0717-castoro-ottawa.svg', hex: '#93857B', price: 2680 },
  { code: '0748', name: 'beige-arizona', textureFile: '0748-beige-arizona.svg', hex: '#B1A192', price: 2640 },
  { code: '0725', name: 'grigio-efeso', textureFile: '0725-grigio-efeso.svg', hex: '#CFCFD0', price: 2580 },
  { code: '0718', name: 'grigio-londra', textureFile: '0718-grigio-londra.svg', hex: '#757271', price: 2550 },
  { code: '0752', name: 'grigio-antrim', textureFile: '0752-grigio-antrim.svg', hex: '#A0A19F', price: 2550 },
  { code: '0720', name: 'nero-ingo', textureFile: '0720-nero-ingo.svg', hex: '#2D2D2D', price: 2380 },
  { code: '0724', name: 'grigio-bromo', textureFile: '0724-grigio-bromo.svg', hex: '#505255', price: 2420 },
  // Bloom additions
  { code: '0751', name: 'rosso-jaipur', textureFile: '0789-rosso-namib.svg', hex: '#6B3A3E', price: 2800 },
  { code: '0750', name: 'verde-comodoro', textureFile: '0773-verde-brac.svg', hex: '#3E3432', price: 2650 },
  { code: '0749', name: 'cacao-orinoco', textureFile: '0793-grigio-aragona.svg', hex: '#3E3432', price: 2680 },
  { code: '0754', name: 'blu-fes', textureFile: '0792-blu-shaba.svg', hex: '#2F3B4C', price: 2750 },
];

// FENIX NTA (metals) - Already exists: 5000, 5001, 5003
const ntaColors = [
  { code: '5000', name: 'acciaio-hamilton', textureFile: '5000-acciaio-hamilton.svg', hex: '#A8A5A1', price: 4200 },
  { code: '5001', name: 'argento-dukat', textureFile: '5001-argento-dukat.svg', hex: '#BEBEC0', price: 4600 },
  { code: '5003', name: 'oro-cortez', textureFile: '5003-oro-cortez.svg', hex: '#C4B5A0', price: 5800 },
];

// Create FENIX BLOOM textures (10)
console.log('Creating FENIX BLOOM textures...');

bloomMaterials.forEach(mat => {
  const sourcePath = path.join('C:\\Projects\\iimos-workspace\\public\\textures\\solid', mat.textureFile);
  const targetPath = path.join('C:\\Projects\\iimos-workspace\\public\\textures\\solid', `fenixbloom-${mat.name}.svg`);

  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, targetPath);
    console.log('Created: fenixbloom-' + mat.name + '.svg (from ' + mat.textureFile + ')');
  } else {
    // Create from hex if texture file not found
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='512' height='512'>
      <rect width='100%' height='100%' fill='${mat.hex}'/>
    </svg>`;
    fs.writeFileSync(targetPath, svg);
    console.log('Created: fenixbloom-' + mat.name + '.svg (from hex:' + mat.hex + ')');
  }
});

// Create FENIX NTM textures (14)
console.log('Creating FENIX NTM textures...');

ntmMaterials.forEach(mat => {
  const sourcePath = path.join('C:\\Projects\\iimos-workspace\\public\\textures\\solid', mat.textureFile);
  const targetPath = path.join('C:\\Projects\\iimos-workspace\\public\\textures\\solid', `fenixntm-${mat.name}.svg`);

  if (fs.existsSync(sourcePath)) {
    fs.copyFileSync(sourcePath, targetPath);
    console.log('Created: fenixntm-' + mat.name + '.svg (from ' + mat.textureFile + ')');
  } else {
    // Create from hex if texture file not found
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='512' height='512'>
      <rect width='100%' height='100%' fill='${mat.hex}'/>
    </svg>`;
    fs.writeFileSync(targetPath, svg);
    console.log('Created: fenixntm-' + mat.name + '.svg (from hex:' + mat.hex + ')');
  }
});

// Create FENIX NTA textures (3) - Already exist (5000, 5001, 5003)
console.log('Ensuring FENIX NTA textures exist...');

ntaColors.forEach(mat => {
  const filePath = path.join('C:\\Projects\\iimos-workspace\\public\\textures\\solid', `fenixnta-${mat.name}.svg`);
  
  if (!fs.existsSync(filePath)) {
    // Create from hex
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='512' height='512'>
      <rect width='100%' height='100%' fill='${mat.hex}'/>
    </svg>`;
    fs.writeFileSync(filePath, svg);
    console.log('Created: fenixnta-' + mat.name + '.svg (from hex:' + mat.hex + ')');
  } else {
    console.log('Exists: fenixnta-' + mat.name + '.svg');
  }
});

console.log('\nDone!');
console.log('- FENIX BLOOM:', bloomMaterials.length, 'textures');
console.log('- FENIX NTM:', ntmMaterials.length, 'textures');
console.log('- FENIX NTA:', ntaColors.length, 'textures');
console.log('TOTAL:', bloomMaterials.length + ntmMaterials.length + ntaColors.length, 'FENIX textures');
