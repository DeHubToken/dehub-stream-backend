import slugify from 'slugify'
export const generateSlug = (string:string)=>{
    return slugify(string, "-").toLowerCase()
}