const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const validInput = require('../utils/validInput');
const verify = require('../utils/verifyToken');
const { responseError, callRes } = require('../response/error');
const checkInput = require('../utils/validInput');
const validTime = require('../utils/validTime');
const User = require('../models/User');
var multer = require('multer');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const MAX_SIZE_IMAGE = 4 * 1024 * 1024; // for 4MB
const { getUserIDFromToken } = require('../utils/getUserIDFromToken');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_NAME,
  api_key: process.env.CLOUDINARY_KEY,
  api_secret: process.env.CLOUDINARY_SECRET,
});

const storage = new CloudinaryStorage({
  cloudinary,
  allowedFormats: ['jpg', 'png', 'jpeg'],
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});

const uploader = multer({ storage });

router.post('/get_user_info', async (req, res) => {
  let { token, user_id } = req.query;
  let tokenUser, tokenError;
  if (token) {
    tokenUser = await getUserIDFromToken(token);
    if (tokenUser && typeof tokenUser === 'string')
      return callRes(res, responseError[tokenUser]);
  }
  if (!user_id && tokenUser) {
    user_id = tokenUser.id;
  } else {
    if (user_id && typeof user_id != 'string')
      return callRes(res, responseError.PARAMETER_TYPE_IS_INVALID, 'user_id');
  }
  if (!user_id) return callRes(res, responseError.PARAMETER_IS_NOT_ENOUGH);
  let user;
  let data = {
    id: null,
    username: null,
    created: null,
    description: null,
    avatar: null,
    cover_image: null,
    link: null,
    address: null,
    city: null,
    country: null,
    listing: null,
    is_friend: null,
    online: null,
  };
  try {
    user = await User.findById(user_id);
    if (!user)
      return callRes(res, responseError.NO_DATA_OR_END_OF_LIST_DATA, 'user');
    if (tokenUser && user_id != tokenUser.id && user.blockedList) {
      let index = user.blockedList.findIndex((element) =>
        element.user._id.equals(tokenUser.id)
      );
      if (index >= 0)
        return callRes(
          res,
          responseError.USER_IS_NOT_VALIDATED,
          'bị block rồi em ơi, khổ quá'
        );
      let index1 = tokenUser.blockedList.findIndex((element) =>
        element.user._id.equals(user.id)
      );
      if (index1 >= 0)
        return callRes(
          res,
          responseError.USER_IS_NOT_VALIDATED,
          'bị block rồi em ơi, khổ quá'
        );
    }
    data.id = user._id.toString();
    data.username = user.name;
    data.created = validTime.timeToSecond(user.createdAt);
    data.description = user.description;
    data.avatar = user.avatar.url;
    data.cover_image = user.coverImage.url;
    data.link = user.link;
    data.address = user.address;
    data.city = user.city;
    data.country = user.country;
    data.listing = user.friends.length;
    data.is_friend = false;
    if (tokenUser && user_id != tokenUser.id) {
      let indexExist = user.friends.findIndex((element) =>
        element.friend._id.equals(tokenUser.id)
      );
      data.is_friend = indexExist >= 0 ? true : false;
    }
    return callRes(res, responseError.OK, data);
  } catch (error) {
    return callRes(res, responseError.UNKNOWN_ERROR, error.message);
  }
});

var cpUpload = uploader.fields([{ name: 'avatar' }, { name: 'cover_image' }]);
router.post('/set_user_info', cpUpload, verify, async (req, res) => {
  let { username, description, address, city, country, link } = req.query;
  let fileAvatar, fileCoverImage, linkAvatar, linkCoverImage;
  let user, promise1, promise2, inputError;
  if (req.files) {
    if (req.files.avatar != undefined) {
      if (req.files.avatar.length > 1)
        return callRes(
          res,
          responseError.PARAMETER_VALUE_IS_INVALID,
          'avatar >= 2 files'
        );
      fileAvatar = req.files.avatar[0];
    }
    if (req.files.cover_image != undefined) {
      if (req.files.cover_image.length > 1)
        return callRes(
          res,
          responseError.PARAMETER_VALUE_IS_INVALID,
          'cover_image >= 2 files'
        );
      fileCoverImage = req.files.cover_image[0];
    }
  }
  if (username) {
    if (typeof username !== 'string')
      return callRes(res, responseError.PARAMETER_TYPE_IS_INVALID, 'username');
    await checkInput
      .checkUserName(username)
      .then((result) => console.log(result, ' passed!'))
      .catch((err) => (inputError = err));
    if (inputError)
      return callRes(
        res,
        responseError.PARAMETER_VALUE_IS_INVALID,
        'username: ' + inputError
      );
  }
  if (description) {
    if (typeof description !== 'string')
      return callRes(
        res,
        responseError.PARAMETER_TYPE_IS_INVALID,
        'description'
      );
    if (description.length > 150)
      return callRes(
        res,
        responseError.PARAMETER_VALUE_IS_INVALID,
        'description length'
      );
  }
  if (address && typeof address !== 'string')
    return callRes(res, responseError.PARAMETER_TYPE_IS_INVALID, 'address');
  if (city && typeof city !== 'string')
    return callRes(res, responseError.PARAMETER_TYPE_IS_INVALID, 'city');
  if (country && typeof country !== 'string')
    return callRes(res, responseError.PARAMETER_TYPE_IS_INVALID, 'country');
  if (link) {
    if (typeof link !== 'string')
      return callRes(res, responseError.PARAMETER_TYPE_IS_INVALID, 'link');
    if (!validInput.checkLink(link))
      return callRes(
        res,
        responseError.PARAMETER_VALUE_IS_INVALID,
        'link ' + link + ' banned'
      );
  }
  try {
    try {
      user = await User.findById(req.user.id);
    } catch (error) {
      return callRes(res, responseError.NO_DATA_OR_END_OF_LIST_DATA, 'user');
    }

    if (fileAvatar) {
      if (!checkSizeImage(fileAvatar))
        return callRes(
          res,
          responseError.FILE_SIZE_IS_TOO_BIG,
          'avatar: file quá lớn, max = 4MB'
        );
      if (!checkTypeImage(fileAvatar))
        return callRes(
          res,
          responseError.PARAMETER_TYPE_IS_INVALID,
          'avatar: sai định dạng'
        );
      if (user.avatar.filename) {
        try {
          console.log('xoa avatar...');
          await deleteRemoteFile(user.avatar.filename);
          console.log('xoa avatar xong!');
        } catch (error) {
          console.log('xoa avatar failed');
          return callRes(res, responseError.EXCEPTION_ERROR, error.message);
        }
      }
      try {
        promise1 = await uploadFile(fileAvatar);
        linkAvatar = promise1;
      } catch (error) {
        return callRes(res, responseError.UPLOAD_FILE_FAILED, error.message);
      }
    }
    if (fileCoverImage) {
      if (!checkSizeImage(fileCoverImage))
        return callRes(
          res,
          responseError.FILE_SIZE_IS_TOO_BIG,
          'cover_image: file quá lớn, max = 4MB'
        );
      if (!checkTypeImage(fileCoverImage))
        return callRes(
          res,
          responseError.PARAMETER_TYPE_IS_INVALID,
          'cover_image: sai định dạng'
        );
      if (user.coverImage.filename) {
        try {
          console.log('xoa coverImage...');
          await deleteRemoteFile(user.coverImage.filename);
          console.log('xoa coverImage xong!');
        } catch (error) {
          console.log('xoa coverImage failed');
          return callRes(res, responseError.EXCEPTION_ERROR, error.message);
        }
      }
      try {
        promise2 = await uploadFile(fileCoverImage);
        linkCoverImage = promise2;
      } catch (error) {
        return callRes(res, responseError.UPLOAD_FILE_FAILED, error.message);
      }
    }
    if (username) user.name = username;
    if (description) user.description = description;
    if (address) user.address = address;
    if (city) user.city = city;
    if (country) user.country = country;
    if (link) user.link = link;
    if (linkAvatar) user.avatar = linkAvatar;
    if (linkCoverImage) user.coverImage = linkCoverImage;
    try {
      user = await user.save();
    } catch (error) {
      return callRes(res, responseError.CAN_NOT_CONNECT_TO_DB, error.message);
    }

    return callRes(res, responseError.OK, {
      avatar: user.avatar.url,
      cover_image: user.coverImage.url,
      link: user.link,
      address: user.address,
      city: user.city,
      country: user.country,
      username: user.name,
      description: user.description,
    });
  } catch (error) {
    return callRes(res, responseError.UNKNOWN_ERROR, error.message);
  }
});

module.exports = router;

const checkSizeImage = (image) => image.size <= MAX_SIZE_IMAGE;

const checkTypeImage = (image) => {
  const filetypes = /jpeg|jpg|png/;
  return filetypes.test(image.mimetype);
};

function uploadFile(file) {
  return new Promise((resolve) => {
    cloudinary.uploader
      .upload(file.path, {
        folder: 'Facebook',
      })
      .then((result) => {
        if (result) {
          resolve({
            filename: result.public_id,
            url: result.secure_url,
          });
        }
      });
  });
}

async function deleteRemoteFile(filename) {
  await cloudinary.uploader.destroy(filename);
}
