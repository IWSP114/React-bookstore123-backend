let bcrypt = require('bcryptjs');

async function hashPassword(password) {
    const saltRounds = 10;
    const salt = await bcrypt.genSalt(saltRounds); // Awaiting the salt generation
    const hash = await bcrypt.hash(password, salt); // Awaiting the hashing process
    return hash; // Return the hashed password
}

async function compareHash(inputPassword, hashPassword) {
  const result = await bcrypt.compare(inputPassword, hashPassword);
  return result;
}

module.exports = {
  hashPassword,
  compareHash
}