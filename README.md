# tinyti.js

This is a fork of AmesingFlank's [taichi.js](https://github.com/AmesingFlank/taichi.js) which is, in turn, a Javascript version of the Python library [Taichi](https://github.com/taichi-dev/taichi).

This fork:

- Implements mipmap generation and LOD sampling. (mipmaps generated w/ webgpu-spd)
- Removes the "engine" components of taichi.js. (rendering has been moved to tinymarch)
- Adds and fixes various builtin operations.

See the forked repo and site for documentation.