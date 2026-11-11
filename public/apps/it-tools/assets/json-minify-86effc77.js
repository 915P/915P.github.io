import{_ as e}from"./FormatTransformer.vue_vue_type_script_setup_true_lang-63892e7f.js";import{d as s,t as l,o as i,c as u}from"./index-6b7fa7ee.js";import{l as o}from"./index-231c3e11.js";import{w as p}from"./defaults-4d6daddf.js";import"./TextareaCopyable-20a31c0c.js";import"./Copy-3ec21263.js";const m=`{
	"hello": [
		"world"
	]
}`,y=s({__name:"json-minify",setup(f){const n=t=>p(()=>JSON.stringify(o.parse(t),null,0),""),r=[{validator:t=>t===""||o.parse(t),message:l("station.err.json-invalid")}];return(t,c)=>{const a=e;return i(),u(a,{"input-label":t.$t("station.str.your-raw-json"),"input-default":m,"input-placeholder":t.$t("station.str.paste-your-raw-json-here"),"output-label":t.$t("station.str.minified-version-of-your-json"),"output-language":"json","input-validation-rules":r,transformer:n},null,8,["input-label","input-placeholder","output-label"])}}});export{y as default};
