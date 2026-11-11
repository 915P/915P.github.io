import{I as N,J as h,L as P,d as R,b as _,T as t,aU as J,bt as F,bq as Q,br as Z,bs as K,M as ie,N as ee,cO as ne,Q as G,R as se,o as U,f as j,g as $,e as ae,x as M,a4 as le,j as k,m as y,w as C,cP as H,k as p,i as W,n as te,aL as re,cQ as ce,ac as de,p as pe,t as X,y as ue,F as ge,z as fe,E as he}from"./index-6b7fa7ee.js";import{u as me,_ as ve}from"./useQRCode-dfa6707c.js";import{c as T}from"./index-1d01ea42.js";import{c as ye}from"./token-generator.service-e184dbf0.js";import{_ as D}from"./InputCopyable.vue_vue_type_script_setup_true_lang-504ca496.js";import{c as be}from"./computedRefreshable-a1478b7c.js";import{f as z}from"./format-length-c9d165c6.js";import{u as xe}from"./use-theme-vars-c3d821c3.js";import"./is-browser-fc34c9a6.js";import"./fade-in-scale-up.cssr-7619e83a.js";import"./Tooltip-4f559abe.js";import"./Follower-af63a381.js";import"./utils-01534621.js";import"./get-7921b229.js";import"./clickoutside-cb932f57.js";import"./resolve-slot-646ffcd9.js";import"./use-merged-state-00e5f337.js";import"./use-compitable-e21b7f21.js";import"./flatten-d6cb702e.js";import"./call-7e0089d6.js";import"./use-locale-9fc4d0d4.js";import"./browser-e933942f.js";import"./_commonjs-dynamic-modules-302442b1.js";import"./___vite-browser-external_commonjs-proxy-59c0e36f.js";const $e=N([h("progress",{display:"inline-block"},[h("progress-icon",`
 color: var(--n-icon-color);
 transition: color .3s var(--n-bezier);
 `),P("line",`
 width: 100%;
 display: block;
 `,[h("progress-content",`
 display: flex;
 align-items: center;
 `,[h("progress-graph",{flex:1})]),h("progress-custom-content",{marginLeft:"14px"}),h("progress-icon",`
 width: 30px;
 padding-left: 14px;
 height: var(--n-icon-size-line);
 line-height: var(--n-icon-size-line);
 font-size: var(--n-icon-size-line);
 `,[P("as-text",`
 color: var(--n-text-color-line-outer);
 text-align: center;
 width: 40px;
 font-size: var(--n-font-size);
 padding-left: 4px;
 transition: color .3s var(--n-bezier);
 `)])]),P("circle, dashboard",{width:"120px"},[h("progress-custom-content",`
 position: absolute;
 left: 50%;
 top: 50%;
 transform: translateX(-50%) translateY(-50%);
 display: flex;
 align-items: center;
 justify-content: center;
 `),h("progress-text",`
 position: absolute;
 left: 50%;
 top: 50%;
 transform: translateX(-50%) translateY(-50%);
 display: flex;
 align-items: center;
 color: inherit;
 font-size: var(--n-font-size-circle);
 color: var(--n-text-color-circle);
 font-weight: var(--n-font-weight-circle);
 transition: color .3s var(--n-bezier);
 white-space: nowrap;
 `),h("progress-icon",`
 position: absolute;
 left: 50%;
 top: 50%;
 transform: translateX(-50%) translateY(-50%);
 display: flex;
 align-items: center;
 color: var(--n-icon-color);
 font-size: var(--n-icon-size-circle);
 `)]),P("multiple-circle",`
 width: 200px;
 color: inherit;
 `,[h("progress-text",`
 font-weight: var(--n-font-weight-circle);
 color: var(--n-text-color-circle);
 position: absolute;
 left: 50%;
 top: 50%;
 transform: translateX(-50%) translateY(-50%);
 display: flex;
 align-items: center;
 justify-content: center;
 transition: color .3s var(--n-bezier);
 `)]),h("progress-content",{position:"relative"}),h("progress-graph",{position:"relative"},[h("progress-graph-circle",[N("svg",{verticalAlign:"bottom"}),h("progress-graph-circle-fill",`
 stroke: var(--n-fill-color);
 transition:
 opacity .3s var(--n-bezier),
 stroke .3s var(--n-bezier),
 stroke-dasharray .3s var(--n-bezier);
 `,[P("empty",{opacity:0})]),h("progress-graph-circle-rail",`
 transition: stroke .3s var(--n-bezier);
 overflow: hidden;
 stroke: var(--n-rail-color);
 `)]),h("progress-graph-line",[P("indicator-inside",[h("progress-graph-line-rail",`
 height: 16px;
 line-height: 16px;
 border-radius: 10px;
 `,[h("progress-graph-line-fill",`
 height: inherit;
 border-radius: 10px;
 `),h("progress-graph-line-indicator",`
 background: #0000;
 white-space: nowrap;
 text-align: right;
 margin-left: 14px;
 margin-right: 14px;
 height: inherit;
 font-size: 12px;
 color: var(--n-text-color-line-inner);
 transition: color .3s var(--n-bezier);
 `)])]),P("indicator-inside-label",`
 height: 16px;
 display: flex;
 align-items: center;
 `,[h("progress-graph-line-rail",`
 flex: 1;
 transition: background-color .3s var(--n-bezier);
 `),h("progress-graph-line-indicator",`
 background: var(--n-fill-color);
 font-size: 12px;
 transform: translateZ(0);
 display: flex;
 vertical-align: middle;
 height: 16px;
 line-height: 16px;
 padding: 0 10px;
 border-radius: 10px;
 position: absolute;
 white-space: nowrap;
 color: var(--n-text-color-line-inner);
 transition:
 right .2s var(--n-bezier),
 color .3s var(--n-bezier),
 background-color .3s var(--n-bezier);
 `)]),h("progress-graph-line-rail",`
 position: relative;
 overflow: hidden;
 height: var(--n-rail-height);
 border-radius: 5px;
 background-color: var(--n-rail-color);
 transition: background-color .3s var(--n-bezier);
 `,[h("progress-graph-line-fill",`
 background: var(--n-fill-color);
 position: relative;
 border-radius: 5px;
 height: inherit;
 width: 100%;
 max-width: 0%;
 transition:
 background-color .3s var(--n-bezier),
 max-width .2s var(--n-bezier);
 `,[P("processing",[N("&::after",`
 content: "";
 background-image: var(--n-line-bg-processing);
 animation: progress-processing-animation 2s var(--n-bezier) infinite;
 `)])])])])])]),N("@keyframes progress-processing-animation",`
 0% {
 position: absolute;
 left: 0;
 top: 0;
 bottom: 0;
 right: 100%;
 opacity: 1;
 }
 66% {
 position: absolute;
 left: 0;
 top: 0;
 bottom: 0;
 right: 0;
 opacity: 0;
 }
 100% {
 position: absolute;
 left: 0;
 top: 0;
 bottom: 0;
 right: 0;
 opacity: 0;
 }
 `)]),_e={success:t(F,null),error:t(Q,null),warning:t(Z,null),info:t(K,null)},Ce=R({name:"ProgressLine",props:{clsPrefix:{type:String,required:!0},percentage:{type:Number,default:0},railColor:String,railStyle:[String,Object],fillColor:String,status:{type:String,required:!0},indicatorPlacement:{type:String,required:!0},indicatorTextColor:String,unit:{type:String,default:"%"},processing:{type:Boolean,required:!0},showIndicator:{type:Boolean,required:!0},height:[String,Number],railBorderRadius:[String,Number],fillBorderRadius:[String,Number]},setup(e,{slots:r}){const c=_(()=>z(e.height)),a=_(()=>e.railBorderRadius!==void 0?z(e.railBorderRadius):e.height!==void 0?z(e.height,{c:.5}):""),i=_(()=>e.fillBorderRadius!==void 0?z(e.fillBorderRadius):e.railBorderRadius!==void 0?z(e.railBorderRadius):e.height!==void 0?z(e.height,{c:.5}):"");return()=>{const{indicatorPlacement:n,railColor:m,railStyle:u,percentage:l,unit:d,indicatorTextColor:g,status:o,showIndicator:v,fillColor:s,processing:b,clsPrefix:f}=e;return t("div",{class:`${f}-progress-content`,role:"none"},t("div",{class:`${f}-progress-graph`,"aria-hidden":!0},t("div",{class:[`${f}-progress-graph-line`,{[`${f}-progress-graph-line--indicator-${n}`]:!0}]},t("div",{class:`${f}-progress-graph-line-rail`,style:[{backgroundColor:m,height:c.value,borderRadius:a.value},u]},t("div",{class:[`${f}-progress-graph-line-fill`,b&&`${f}-progress-graph-line-fill--processing`],style:{maxWidth:`${e.percentage}%`,backgroundColor:s,height:c.value,lineHeight:c.value,borderRadius:i.value}},n==="inside"?t("div",{class:`${f}-progress-graph-line-indicator`,style:{color:g}},r.default?r.default():`${l}${d}`):null)))),v&&n==="outside"?t("div",null,r.default?t("div",{class:`${f}-progress-custom-content`,style:{color:g},role:"none"},r.default()):o==="default"?t("div",{role:"none",class:`${f}-progress-icon ${f}-progress-icon--as-text`,style:{color:g}},l,d):t("div",{class:`${f}-progress-icon`,"aria-hidden":!0},t(J,{clsPrefix:f},{default:()=>_e[o]}))):null)}}}),Se={success:t(F,null),error:t(Q,null),warning:t(Z,null),info:t(K,null)},we=R({name:"ProgressCircle",props:{clsPrefix:{type:String,required:!0},status:{type:String,required:!0},strokeWidth:{type:Number,required:!0},fillColor:String,railColor:String,railStyle:[String,Object],percentage:{type:Number,default:0},offsetDegree:{type:Number,default:0},showIndicator:{type:Boolean,required:!0},indicatorTextColor:String,unit:String,viewBoxWidth:{type:Number,required:!0},gapDegree:{type:Number,required:!0},gapOffsetDegree:{type:Number,default:0}},setup(e,{slots:r}){function c(a,i,n){const{gapDegree:m,viewBoxWidth:u,strokeWidth:l}=e,d=50,g=0,o=d,v=0,s=2*d,b=50+l/2,f=`M ${b},${b} m ${g},${o}
      a ${d},${d} 0 1 1 ${v},${-s}
      a ${d},${d} 0 1 1 ${-v},${s}`,S=Math.PI*2*d,w={stroke:n,strokeDasharray:`${a/100*(S-m)}px ${u*8}px`,strokeDashoffset:`-${m/2}px`,transformOrigin:i?"center":void 0,transform:i?`rotate(${i}deg)`:void 0};return{pathString:f,pathStyle:w}}return()=>{const{fillColor:a,railColor:i,strokeWidth:n,offsetDegree:m,status:u,percentage:l,showIndicator:d,indicatorTextColor:g,unit:o,gapOffsetDegree:v,clsPrefix:s}=e,{pathString:b,pathStyle:f}=c(100,0,i),{pathString:S,pathStyle:w}=c(l,m,a),x=100+n;return t("div",{class:`${s}-progress-content`,role:"none"},t("div",{class:`${s}-progress-graph`,"aria-hidden":!0},t("div",{class:`${s}-progress-graph-circle`,style:{transform:v?`rotate(${v}deg)`:void 0}},t("svg",{viewBox:`0 0 ${x} ${x}`},t("g",null,t("path",{class:`${s}-progress-graph-circle-rail`,d:b,"stroke-width":n,"stroke-linecap":"round",fill:"none",style:f})),t("g",null,t("path",{class:[`${s}-progress-graph-circle-fill`,l===0&&`${s}-progress-graph-circle-fill--empty`],d:S,"stroke-width":n,"stroke-linecap":"round",fill:"none",style:w}))))),d?t("div",null,r.default?t("div",{class:`${s}-progress-custom-content`,role:"none"},r.default()):u!=="default"?t("div",{class:`${s}-progress-icon`,"aria-hidden":!0},t(J,{clsPrefix:s},{default:()=>Se[u]})):t("div",{class:`${s}-progress-text`,style:{color:g},role:"none"},t("span",{class:`${s}-progress-text__percentage`},l),t("span",{class:`${s}-progress-text__unit`},o))):null)}}});function Y(e,r,c=100){return`m ${c/2} ${c/2-e} a ${e} ${e} 0 1 1 0 ${2*e} a ${e} ${e} 0 1 1 0 -${2*e}`}const ke=R({name:"ProgressMultipleCircle",props:{clsPrefix:{type:String,required:!0},viewBoxWidth:{type:Number,required:!0},percentage:{type:Array,default:[0]},strokeWidth:{type:Number,required:!0},circleGap:{type:Number,required:!0},showIndicator:{type:Boolean,required:!0},fillColor:{type:Array,default:()=>[]},railColor:{type:Array,default:()=>[]},railStyle:{type:Array,default:()=>[]}},setup(e,{slots:r}){const c=_(()=>e.percentage.map((i,n)=>`${Math.PI*i/100*(e.viewBoxWidth/2-e.strokeWidth/2*(1+2*n)-e.circleGap*n)*2}, ${e.viewBoxWidth*8}`));return()=>{const{viewBoxWidth:a,strokeWidth:i,circleGap:n,showIndicator:m,fillColor:u,railColor:l,railStyle:d,percentage:g,clsPrefix:o}=e;return t("div",{class:`${o}-progress-content`,role:"none"},t("div",{class:`${o}-progress-graph`,"aria-hidden":!0},t("div",{class:`${o}-progress-graph-circle`},t("svg",{viewBox:`0 0 ${a} ${a}`},g.map((v,s)=>t("g",{key:s},t("path",{class:`${o}-progress-graph-circle-rail`,d:Y(a/2-i/2*(1+2*s)-n*s,i,a),"stroke-width":i,"stroke-linecap":"round",fill:"none",style:[{strokeDashoffset:0,stroke:l[s]},d[s]]}),t("path",{class:[`${o}-progress-graph-circle-fill`,v===0&&`${o}-progress-graph-circle-fill--empty`],d:Y(a/2-i/2*(1+2*s)-n*s,i,a),"stroke-width":i,"stroke-linecap":"round",fill:"none",style:{strokeDasharray:c.value[s],strokeDashoffset:0,stroke:u[s]}})))))),m&&r.default?t("div",null,t("div",{class:`${o}-progress-text`},r.default())):null)}}}),Pe=Object.assign(Object.assign({},ee.props),{processing:Boolean,type:{type:String,default:"line"},gapDegree:Number,gapOffsetDegree:Number,status:{type:String,default:"default"},railColor:[String,Array],railStyle:[String,Array],color:[String,Array],viewBoxWidth:{type:Number,default:100},strokeWidth:{type:Number,default:7},percentage:[Number,Array],unit:{type:String,default:"%"},showIndicator:{type:Boolean,default:!0},indicatorPosition:{type:String,default:"outside"},indicatorPlacement:{type:String,default:"outside"},indicatorTextColor:String,circleGap:{type:Number,default:1},height:Number,borderRadius:[String,Number],fillBorderRadius:[String,Number],offsetDegree:Number}),Be=R({name:"Progress",props:Pe,setup(e){const r=_(()=>e.indicatorPlacement||e.indicatorPosition),c=_(()=>{if(e.gapDegree||e.gapDegree===0)return e.gapDegree;if(e.type==="dashboard")return 75}),{mergedClsPrefixRef:a,inlineThemeDisabled:i}=ie(e),n=ee("Progress","-progress",$e,ne,e,a),m=_(()=>{const{status:l}=e,{common:{cubicBezierEaseInOut:d},self:{fontSize:g,fontSizeCircle:o,railColor:v,railHeight:s,iconSizeCircle:b,iconSizeLine:f,textColorCircle:S,textColorLineInner:w,textColorLineOuter:x,lineBgProcessing:B,fontWeightCircle:O,[G("iconColor",l)]:q,[G("fillColor",l)]:I}}=n.value;return{"--n-bezier":d,"--n-fill-color":I,"--n-font-size":g,"--n-font-size-circle":o,"--n-font-weight-circle":O,"--n-icon-color":q,"--n-icon-size-circle":b,"--n-icon-size-line":f,"--n-line-bg-processing":B,"--n-rail-color":v,"--n-rail-height":s,"--n-text-color-circle":S,"--n-text-color-line-inner":w,"--n-text-color-line-outer":x}}),u=i?se("progress",_(()=>e.status[0]),m,e):void 0;return{mergedClsPrefix:a,mergedIndicatorPlacement:r,gapDeg:c,cssVars:i?void 0:m,themeClass:u?.themeClass,onRender:u?.onRender}},render(){const{type:e,cssVars:r,indicatorTextColor:c,showIndicator:a,status:i,railColor:n,railStyle:m,color:u,percentage:l,viewBoxWidth:d,strokeWidth:g,mergedIndicatorPlacement:o,unit:v,borderRadius:s,fillBorderRadius:b,height:f,processing:S,circleGap:w,mergedClsPrefix:x,gapDeg:B,gapOffsetDegree:O,themeClass:q,$slots:I,onRender:A}=this;return A?.(),t("div",{class:[q,`${x}-progress`,`${x}-progress--${e}`,`${x}-progress--${i}`],style:r,"aria-valuemax":100,"aria-valuemin":0,"aria-valuenow":l,role:e==="circle"||e==="line"||e==="dashboard"?"progressbar":"none"},e==="circle"||e==="dashboard"?t(we,{clsPrefix:x,status:i,showIndicator:a,indicatorTextColor:c,railColor:n,fillColor:u,railStyle:m,offsetDegree:this.offsetDegree,percentage:l,viewBoxWidth:d,strokeWidth:g,gapDegree:B===void 0?e==="dashboard"?75:0:B,gapOffsetDegree:O,unit:v},I):e==="line"?t(Ce,{clsPrefix:x,status:i,showIndicator:a,indicatorTextColor:c,railColor:n,fillColor:u,railStyle:m,percentage:l,processing:S,indicatorPlacement:o,unit:v,fillBorderRadius:b,railBorderRadius:s,height:f},I):e==="multiple-circle"?t(ke,{clsPrefix:x,strokeWidth:g,railColor:n,fillColor:u,railStyle:m,viewBoxWidth:d,percentage:l,showIndicator:a,circleGap:w},I):null)}}),ze={viewBox:"0 0 24 24",width:"1.2em",height:"1.2em"},Re=$("path",{fill:"currentColor",d:"M17.65 6.35A7.958 7.958 0 0 0 12 4a8 8 0 0 0-8 8a8 8 0 0 0 8 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18a6 6 0 0 1-6-6a6 6 0 0 1 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35Z"},null,-1),Ie=[Re];function Ne(e,r){return U(),j("svg",ze,Ie)}const Te={name:"mdi-refresh",render:Ne};function De(e){return(e.match(/.{1,2}/g)??[]).map(r=>Number.parseInt(r,16))}function We(e,r){return T.HmacSHA1(T.enc.Hex.parse(e),T.enc.Hex.parse(oe(r))).toString(T.enc.Hex)}function oe(e){const r="ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";return(e.toUpperCase().replace(/=+$/,"").split("").map(i=>r.indexOf(i).toString(2).padStart(5,"0")).join("").match(/.{1,8}/g)??[]).map(i=>Number.parseInt(i,2).toString(16).padStart(2,"0")).join("")}function Oe({key:e,counter:r=0}){const c=We(r.toString(16).padStart(16,"0"),e),a=De(c),i=a[19]&15,n=(a[i]&127)<<24|(a[i+1]&255)<<16|(a[i+2]&255)<<8|a[i+3]&255;return String(n%1e6).padStart(6,"0")}function V({now:e,timeStep:r}){return Math.floor(e/1e3/r)}function L({key:e,now:r=Date.now(),timeStep:c=30}){const a=V({now:r,timeStep:c});return Oe({key:e,counter:a})}function qe({secret:e,app:r="IT-Tools",account:c="demo-user",algorithm:a="SHA1",digits:i=6,period:n=30}){const u=ae({issuer:r,secret:e,algorithm:a,digits:i,period:n}).map((l,d)=>`${encodeURIComponent(d)}=${encodeURIComponent(l)}`).join("&");return`otpauth://totp/${encodeURIComponent(r)}:${encodeURIComponent(c)}?${u}`}function E(){return ye({length:16,alphabet:"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567"})}const Ae={"mb-5px":"","w-full":"",flex:"","items-center":""},Me={"flex-1":"","text-left":""},He={"flex-1":"","text-center":""},Le={"flex-1":"","text-right":""},Ve={flex:"","items-center":""},Ue=R({__name:"token-display",props:{tokens:{}},setup(e){const r=e,{copy:c,isJustCopied:a}=M({createToast:!1}),{copy:i,isJustCopied:n}=M({createToast:!1}),{copy:m,isJustCopied:u}=M({createToast:!1}),{tokens:l}=le(r);return(d,g)=>{const o=te,v=re;return U(),j("div",null,[$("div",Ae,[$("div",Me,k(d.$t("station.str.previous")),1),$("div",He,k(d.$t("station.str.current-otp")),1),$("div",Le,k(d.$t("station.str.next")),1)]),$("div",Ve,[y(v,{tooltip:p(a)?"Copied !":"Copy previous OTP",position:"bottom","flex-1":""},{default:C(()=>[y(o,{"data-test-id":"previous-otp","w-full":"","important:h-12":"","important:rounded-r-none":"","important:font-mono":"",onClick:g[0]||(g[0]=H(s=>p(c)(p(l).previous),["prevent"]))},{default:C(()=>[W(k(p(l).previous),1)]),_:1})]),_:1},8,["tooltip"]),y(v,{tooltip:p(n)?"Copied !":"Copy current OTP",position:"bottom","flex-1":"","flex-basis-5xl":""},{default:C(()=>[y(o,{"data-test-id":"current-otp","w-full":"","important:border-x":"1px solid gray op-40","important:h-12":"","important:rounded-0":"","important:text-22px":"",onClick:g[1]||(g[1]=H(s=>p(i)(p(l).current),["prevent"]))},{default:C(()=>[W(k(p(l).current),1)]),_:1})]),_:1},8,["tooltip"]),y(v,{tooltip:p(u)?"Copied !":"Copy next OTP",position:"bottom","flex-1":""},{default:C(()=>[y(o,{"data-test-id":"next-otp","w-full":"","important:h-12":"","important:rounded-l-none":"",onClick:g[2]||(g[2]=H(s=>p(m)(p(l).next),["prevent"]))},{default:C(()=>[W(k(p(l).next),1)]),_:1})]),_:1},8,["tooltip"])])])}}}),je={style:{"max-width":"350px"}},Ge={style:{"text-align":"center"}},Xe={"mt-4":"",flex:"","flex-col":"","items-center":"","justify-center":"","gap-3":""},Ye={style:{"max-width":"350px"}},Ee=R({__name:"otp-code-generator-and-validator",setup(e){const r=ce(),c=_(()=>r.value/1e3%30),a=xe(),i=de(),n=pe(E());function m(){n.value=E()}const[u]=be(()=>({previous:L({key:n.value,now:r.value-3e4}),current:L({key:n.value,now:r.value}),next:L({key:n.value,now:r.value+3e4})}),{throttle:500}),l=_(()=>qe({secret:n.value})),{qrcode:d}=me({text:l,color:{background:_(()=>i.isDarkTheme?"#ffffff":"#00000000"),foreground:"#000000"},options:{width:210}}),g=[{message:X("station.err.base32-secret"),validator:o=>o.toUpperCase().match(/^[A-Z234567]+$/)},{message:X("station.err.secret-required"),validator:o=>o!==""}];return(o,v)=>{const s=Te,b=te,f=re,S=fe,w=Be,x=ve;return U(),j(ge,null,[$("div",je,[y(S,{value:p(n),"onUpdate:value":v[0]||(v[0]=B=>ue(n)?n.value=B:null),label:o.$t("station.str.secret"),placeholder:o.$t("station.str.paste-your-totp-secret"),"mb-5":"","validation-rules":g},{suffix:C(()=>[y(f,{tooltip:o.$t("station.str.generate-a-new-random-secret")},{default:C(()=>[y(b,{circle:"",variant:"text",size:"small",onClick:m},{default:C(()=>[y(s)]),_:1})]),_:1},8,["tooltip"])]),_:1},8,["value","label","placeholder"]),$("div",null,[y(Ue,{tokens:p(u)},null,8,["tokens"]),y(w,{percentage:100*p(c)/30,color:p(a).primaryColor,"show-indicator":!1},null,8,["percentage","color"]),$("div",Ge," Next in "+k(String(Math.floor(30-p(c))).padStart(2,"0"))+"s ",1)]),$("div",Xe,[y(x,{src:p(d)},null,8,["src"]),y(b,{href:p(l),target:"_blank"},{default:C(()=>[W(k(o.$t("station.str.open-key-uri-in-new-tab")),1)]),_:1},8,["href"])])]),$("div",Ye,[y(D,{label:o.$t("station.str.secret-in-hexadecimal"),value:p(oe)(p(n)),readonly:"",placeholder:o.$t("station.str.secret-in-hex-will-be-displayed-here"),"mb-5":""},null,8,["label","value","placeholder"]),y(D,{label:o.$t("station.str.epoch"),value:Math.floor(p(r)/1e3).toString(),readonly:"","mb-5":"",placeholder:o.$t("station.str.epoch-in-sec-will-be-displayed-here")},null,8,["label","value","placeholder"]),$("p",null,k(o.$t("station.str.iteration")),1),y(D,{value:String(p(V)({now:p(r),timeStep:30})),readonly:"",label:o.$t("station.str.count"),"label-position":"left","label-width":"90px","label-align":"right",placeholder:o.$t("station.str.iteration-count-will-be-displayed-here")},null,8,["value","label","placeholder"]),y(D,{value:p(V)({now:p(r),timeStep:30}).toString(16).padStart(16,"0"),readonly:"",placeholder:o.$t("station.str.iteration-count-in-hex-will-be-displayed-here"),"label-position":"left","label-width":"90px","label-align":"right",label:o.$t("station.str.padded-hex")},null,8,["value","placeholder","label"])])],64)}}});const bt=he(Ee,[["__scopeId","data-v-137c4333"]]);export{bt as default};
