// Container / consolidated shipping rates by destination port.
// Order of values in each array matches PORTS = ['GA','NY','CA','TX','WA','VA']
// null = route not offered for that combination.
const CONTAINER_RATES = {
  '40ft3auto':        [2900, 3100, 5600, 3950, 5450, 2900],
  '40ft4auto':         [3000, 3200, 5700, 4050, 5550, 3000],
  '45ft4auto':         [3200, 3400, null, 4250, 5850, 3200],
  '45ft5auto':         [3400, 3600, null, 4450, 6050, 3400],
  'motorcycle':        [350, 350, 450, 400, 450, 350],
  'oversizeMotorcycle': [700, 700, 900, 800, 900, 700],
  'jetski':            [700, 700, 900, 800, 900, 700]
};
