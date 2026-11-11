import{T as l,an as ne,I as d,J as r,L as h,aE as t,b0 as ae,be as le,bf as de,d as ie,p as _,M as te,ao as se,as as be,aq as he,N as K,bg as ue,$ as ke,b as B,Q as I,R as fe,aX as ve,b2 as xe,aT as me}from"./index-6b7fa7ee.js";import{u as ge}from"./use-form-item-ae22673e.js";import{u as pe}from"./use-merged-state-00e5f337.js";import{r as Ce}from"./resolve-slot-646ffcd9.js";import{c as T}from"./call-7e0089d6.js";const we=l("svg",{viewBox:"0 0 64 64",class:"check-icon"},l("path",{d:"M50.42,16.76L22.34,39.45l-8.1-11.46c-1.12-1.58-3.3-1.96-4.88-0.84c-1.58,1.12-1.95,3.3-0.84,4.88l10.26,14.51  c0.56,0.79,1.42,1.31,2.38,1.45c0.16,0.02,0.32,0.03,0.48,0.03c0.8,0,1.57-0.27,2.2-0.78l30.99-25.03c1.5-1.21,1.74-3.42,0.52-4.92  C54.13,15.78,51.93,15.55,50.42,16.76z"})),ye=l("svg",{viewBox:"0 0 100 100",class:"line-icon"},l("path",{d:"M80.2,55.5H21.4c-2.8,0-5.1-2.5-5.1-5.5l0,0c0-3,2.3-5.5,5.1-5.5h58.7c2.8,0,5.1,2.5,5.1,5.5l0,0C85.2,53.1,82.9,55.5,80.2,55.5z"})),ze=ne("n-checkbox-group"),Re=d([r("checkbox",`
 font-size: var(--n-font-size);
 outline: none;
 cursor: pointer;
 display: inline-flex;
 flex-wrap: nowrap;
 align-items: flex-start;
 word-break: break-word;
 line-height: var(--n-size);
 --n-merged-color-table: var(--n-color-table);
 `,[h("show-label","line-height: var(--n-label-line-height);"),d("&:hover",[r("checkbox-box",[t("border","border: var(--n-border-checked);")])]),d("&:focus:not(:active)",[r("checkbox-box",[t("border",`
 border: var(--n-border-focus);
 box-shadow: var(--n-box-shadow-focus);
 `)])]),h("inside-table",[r("checkbox-box",`
 background-color: var(--n-merged-color-table);
 `)]),h("checked",[r("checkbox-box",`
 background-color: var(--n-color-checked);
 `,[r("checkbox-icon",[d(".check-icon",`
 opacity: 1;
 transform: scale(1);
 `)])])]),h("indeterminate",[r("checkbox-box",[r("checkbox-icon",[d(".check-icon",`
 opacity: 0;
 transform: scale(.5);
 `),d(".line-icon",`
 opacity: 1;
 transform: scale(1);
 `)])])]),h("checked, indeterminate",[d("&:focus:not(:active)",[r("checkbox-box",[t("border",`
 border: var(--n-border-checked);
 box-shadow: var(--n-box-shadow-focus);
 `)])]),r("checkbox-box",`
 background-color: var(--n-color-checked);
 border-left: 0;
 border-top: 0;
 `,[t("border",{border:"var(--n-border-checked)"})])]),h("disabled",{cursor:"not-allowed"},[h("checked",[r("checkbox-box",`
 background-color: var(--n-color-disabled-checked);
 `,[t("border",{border:"var(--n-border-disabled-checked)"}),r("checkbox-icon",[d(".check-icon, .line-icon",{fill:"var(--n-check-mark-color-disabled-checked)"})])])]),r("checkbox-box",`
 background-color: var(--n-color-disabled);
 `,[t("border",`
 border: var(--n-border-disabled);
 `),r("checkbox-icon",[d(".check-icon, .line-icon",`
 fill: var(--n-check-mark-color-disabled);
 `)])]),t("label",`
 color: var(--n-text-color-disabled);
 `)]),r("checkbox-box-wrapper",`
 position: relative;
 width: var(--n-size);
 flex-shrink: 0;
 flex-grow: 0;
 user-select: none;
 -webkit-user-select: none;
 `),r("checkbox-box",`
 position: absolute;
 left: 0;
 top: 50%;
 transform: translateY(-50%);
 height: var(--n-size);
 width: var(--n-size);
 display: inline-block;
 box-sizing: border-box;
 border-radius: var(--n-border-radius);
 background-color: var(--n-color);
 transition: background-color 0.3s var(--n-bezier);
 `,[t("border",`
 transition:
 border-color .3s var(--n-bezier),
 box-shadow .3s var(--n-bezier);
 border-radius: inherit;
 position: absolute;
 left: 0;
 right: 0;
 top: 0;
 bottom: 0;
 border: var(--n-border);
 `),r("checkbox-icon",`
 display: flex;
 align-items: center;
 justify-content: center;
 position: absolute;
 left: 1px;
 right: 1px;
 top: 1px;
 bottom: 1px;
 `,[d(".check-icon, .line-icon",`
 width: 100%;
 fill: var(--n-check-mark-color);
 opacity: 0;
 transform: scale(0.5);
 transform-origin: center;
 transition:
 fill 0.3s var(--n-bezier),
 transform 0.3s var(--n-bezier),
 opacity 0.3s var(--n-bezier),
 border-color 0.3s var(--n-bezier);
 `),ae({left:"1px",top:"1px"})])]),t("label",`
 color: var(--n-text-color);
 transition: color .3s var(--n-bezier);
 user-select: none;
 -webkit-user-select: none;
 padding: var(--n-label-padding);
 font-weight: var(--n-label-font-weight);
 `,[d("&:empty",{display:"none"})])]),le(r("checkbox",`
 --n-merged-color-table: var(--n-color-table-modal);
 `)),de(r("checkbox",`
 --n-merged-color-table: var(--n-color-table-popover);
 `))]),Se=Object.assign(Object.assign({},K.props),{size:String,checked:{type:[Boolean,String,Number],default:void 0},defaultChecked:{type:[Boolean,String,Number],default:!1},value:[String,Number],disabled:{type:Boolean,default:void 0},indeterminate:Boolean,label:String,focusable:{type:Boolean,default:!0},checkedValue:{type:[Boolean,String,Number],default:!0},uncheckedValue:{type:[Boolean,String,Number],default:!1},"onUpdate:checked":[Function,Array],onUpdateChecked:[Function,Array],privateInsideTable:Boolean,onChange:[Function,Array]}),Be=ie({name:"Checkbox",props:Se,setup(o){const m=_(null),{mergedClsPrefixRef:u,inlineThemeDisabled:g,mergedRtlRef:z}=te(o),p=ge(o,{mergedSize(e){const{size:i}=o;if(i!==void 0)return i;if(n){const{value:a}=n.mergedSizeRef;if(a!==void 0)return a}if(e){const{mergedSize:a}=e;if(a!==void 0)return a.value}return"medium"},mergedDisabled(e){const{disabled:i}=o;if(i!==void 0)return i;if(n){if(n.disabledRef.value)return!0;const{maxRef:{value:a},checkedCountRef:b}=n;if(a!==void 0&&b.value>=a&&!s.value)return!0;const{minRef:{value:v}}=n;if(v!==void 0&&b.value<=v&&s.value)return!0}return e?e.disabled.value:!1}}),{mergedDisabledRef:C,mergedSizeRef:w}=p,n=se(ze,null),c=_(o.defaultChecked),S=be(o,"checked"),D=pe(S,c),s=he(()=>{if(n){const e=n.valueSetRef.value;return e&&o.value!==void 0?e.has(o.value):!1}else return D.value===o.checkedValue}),R=K("Checkbox","-checkbox",Re,ue,o,u);function y(e){if(n&&o.value!==void 0)n.toggleCheckbox(!s.value,o.value);else{const{onChange:i,"onUpdate:checked":a,onUpdateChecked:b}=o,{nTriggerFormInput:v,nTriggerFormChange:M}=p,x=s.value?o.uncheckedValue:o.checkedValue;a&&T(a,x,e),b&&T(b,x,e),i&&T(i,x,e),v(),M(),c.value=x}}function k(e){C.value||y(e)}function V(e){if(!C.value)switch(e.key){case" ":case"Enter":y(e)}}function j(e){switch(e.key){case" ":e.preventDefault()}}const E={focus:()=>{var e;(e=m.value)===null||e===void 0||e.focus()},blur:()=>{var e;(e=m.value)===null||e===void 0||e.blur()}},F=ke("Checkbox",z,u),$=B(()=>{const{value:e}=w,{common:{cubicBezierEaseInOut:i},self:{borderRadius:a,color:b,colorChecked:v,colorDisabled:M,colorTableHeader:x,colorTableHeaderModal:N,colorTableHeaderPopover:P,checkMarkColor:U,checkMarkColorDisabled:H,border:L,borderFocus:A,borderDisabled:O,borderChecked:G,boxShadowFocus:W,textColor:q,textColorDisabled:J,checkMarkColorDisabledChecked:Q,colorDisabledChecked:X,borderDisabledChecked:Y,labelPadding:Z,labelLineHeight:ee,labelFontWeight:oe,[I("fontSize",e)]:re,[I("size",e)]:ce}}=R.value;return{"--n-label-line-height":ee,"--n-label-font-weight":oe,"--n-size":ce,"--n-bezier":i,"--n-border-radius":a,"--n-border":L,"--n-border-checked":G,"--n-border-focus":A,"--n-border-disabled":O,"--n-border-disabled-checked":Y,"--n-box-shadow-focus":W,"--n-color":b,"--n-color-checked":v,"--n-color-table":x,"--n-color-table-modal":N,"--n-color-table-popover":P,"--n-color-disabled":M,"--n-color-disabled-checked":X,"--n-text-color":q,"--n-text-color-disabled":J,"--n-check-mark-color":U,"--n-check-mark-color-disabled":H,"--n-check-mark-color-disabled-checked":Q,"--n-font-size":re,"--n-label-padding":Z}}),f=g?fe("checkbox",B(()=>w.value[0]),$,o):void 0;return Object.assign(p,E,{rtlEnabled:F,selfRef:m,mergedClsPrefix:u,mergedDisabled:C,renderedChecked:s,mergedTheme:R,labelId:ve(),handleClick:k,handleKeyUp:V,handleKeyDown:j,cssVars:g?void 0:$,themeClass:f?.themeClass,onRender:f?.onRender})},render(){var o;const{$slots:m,renderedChecked:u,mergedDisabled:g,indeterminate:z,privateInsideTable:p,cssVars:C,labelId:w,label:n,mergedClsPrefix:c,focusable:S,handleKeyUp:D,handleKeyDown:s,handleClick:R}=this;(o=this.onRender)===null||o===void 0||o.call(this);const y=Ce(m.default,k=>n||k?l("span",{class:`${c}-checkbox__label`,id:w},n||k):null);return l("div",{ref:"selfRef",class:[`${c}-checkbox`,this.themeClass,this.rtlEnabled&&`${c}-checkbox--rtl`,u&&`${c}-checkbox--checked`,g&&`${c}-checkbox--disabled`,z&&`${c}-checkbox--indeterminate`,p&&`${c}-checkbox--inside-table`,y&&`${c}-checkbox--show-label`],tabindex:g||!S?void 0:0,role:"checkbox","aria-checked":z?"mixed":u,"aria-labelledby":w,style:C,onKeyup:D,onKeydown:s,onClick:R,onMousedown:()=>{me("selectstart",window,k=>{k.preventDefault()},{once:!0})}},l("div",{class:`${c}-checkbox-box-wrapper`}," ",l("div",{class:`${c}-checkbox-box`},l(xe,null,{default:()=>this.indeterminate?l("div",{key:"indeterminate",class:`${c}-checkbox-icon`},ye):l("div",{key:"check",class:`${c}-checkbox-icon`},we)}),l("div",{class:`${c}-checkbox-box__border`}))),y)}});export{Be as _};
