# web3-simple-backend
This is backend for web3
## supported features
- user auth by web3 signing
- return encrypted content

# encryption and decrytion with AES128

## Node.js
```
const crypto = require("crypto");
const algo = 'aes-128-cbc';
const key = "security_key";
const iv = "iv_key";
const value = 'HelloWorld';
const keyBuffer = new Buffer(crypto.createHash('md5').update(key).digest('hex'),"hex");
const ivBuffer = new Buffer(crypto.createHash('md5').update(iv).digest('hex'),"hex");
const textBuffer = new Buffer(value);
let cipher = crypto.createCipheriv(algo, keyBuffer,ivBuffer);
let encrypted = cipher.update(textBuffer);
let encryptedFinal = cipher.final();
let encryptedText = encrypted.toString('base64') + encryptedFinal.toString('base64');
console.log(encryptedText);
let decipher = crypto.createDecipheriv(algo, keyBuffer,ivBuffer);
decipher.setAutoPadding(true); //padding so content can be different by languages
let decipheredContent = decipher.update(encryptedText,'base64','utf8');
decipheredContent += decipher.final('utf8');
console.log(decipheredContent); 
```
## HelloWorld C#
```
AES-CBC-128BIT-PKCS5 using UnityEngine;
using System;
using System.Text;
using System.IO;
using System.Security.Cryptography;
using System.Runtime.Remoting.Metadata.W3cXsd2001;

public class Crypto
{
    public static readonly string key = MD5Hash("security_key");
    public static readonly string iv = MD5Hash("iv_key");

    public static string MD5Hash(string str)
    {
        MD5 md5 = new MD5CryptoServiceProvider();
        byte[] hash = md5.ComputeHash(Encoding.ASCII.GetBytes(str));
        StringBuilder stringBuilder = new StringBuilder();
        foreach (byte b in hash)
        {
            stringBuilder.AppendFormat("{0:x2}", b);
        }
        return stringBuilder.ToString();
    }

    private static byte[] GetBytesFromHexString(string strInput)
    {
        byte[] bytArOutput = new byte[] { };
        if ((!string.IsNullOrEmpty(strInput)) && strInput.Length % 2 == 0)
        {
            SoapHexBinary hexBinary = null;
            hexBinary = SoapHexBinary.Parse(strInput);
            bytArOutput = hexBinary.Value;
        }
        return bytArOutput;
    }

    //AES encryption
    public static string AES128Encrypt(string Input)
    {
        try
        {
            RijndaelManaged aes = new RijndaelManaged();
            //aes.KeySize = 256; //using AES256
            aes.KeySize = 128; //using AES128
            aes.BlockSize = 128;
            aes.Mode = CipherMode.CBC;
            aes.Padding = PaddingMode.PKCS7;
            aes.Key = GetBytesFromHexString(key);
            aes.IV = GetBytesFromHexString(iv);

            var encrypt = aes.CreateEncryptor(aes.Key, aes.IV);
            byte[] xBuff = null;
            using (var ms = new MemoryStream())
            {
                using (var cs = new CryptoStream(ms, encrypt, CryptoStreamMode.Write))
                {
                    byte[] xXml = Encoding.UTF8.GetBytes(Input);
                    cs.Write(xXml, 0, xXml.Length);
                }

                xBuff = ms.ToArray();
            }

            string Output = Convert.ToBase64String(xBuff);
            return Output;
        }
        catch (Exception ex)
        {
            Debug.LogError(ex.Message);
            return ex.Message;
        }
    }


    //AES decryption
    public static string AES128Decrypt(string Input)
    {
        try
        {
            RijndaelManaged aes = new RijndaelManaged();
            //aes.KeySize = 256; //using with AES256
            aes.KeySize = 128; //using with AES128
            aes.BlockSize = 128;
            aes.Mode = CipherMode.CBC;
            aes.Padding = PaddingMode.PKCS7;
            aes.Key = GetBytesFromHexString(key);
            aes.IV = GetBytesFromHexString(iv);

            var decrypt = aes.CreateDecryptor();
            byte[] xBuff = null;
            using (var ms = new MemoryStream())
            {
                using (var cs = new CryptoStream(ms, decrypt, CryptoStreamMode.Write))
                {
                    byte[] xXml = Convert.FromBase64String(Input);
                    cs.Write(xXml, 0, xXml.Length);
                }

                xBuff = ms.ToArray();
            }

            string Output = Encoding.UTF8.GetString(xBuff);
            return Output;
        }
        catch (Exception ex)
        {
            Debug.LogError(ex.Message);
            return string.Empty;
        }
    }
}
```