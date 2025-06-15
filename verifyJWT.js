import jwt from 'jsonwebtoken';

export function verifyJWT(req, res, next) {
  const token = req.cookies?.token;
  if (!token) return res.status(401).send({ error: 'Unauthorized: No token' });

  jwt.verify(token, process.env.JWT_SECRET, (err, decoded) => {
    if (err) return res.status(403).send({ error: 'Forbidden: Invalid token' });

    req.decoded = decoded;
    next();
  });
}
