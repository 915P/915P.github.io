import{aP as se,bl as de,b6 as ce,J as O,aE as t,b0 as A,I as N,L as l,aM as H,d as ue,M as he,N as I,p as W,as as be,b as z,Q as m,P as j,a1 as s,R as fe,T as a,b2 as ge,U as ve}from"./index-6b7fa7ee.js";import{u as me}from"./use-form-item-ae22673e.js";import{u as we}from"./use-merged-state-00e5f337.js";import{i as K,r as w}from"./resolve-slot-646ffcd9.js";import{c as L}from"./call-7e0089d6.js";const pe=e=>{const{primaryColor:d,opacityDisabled:f,borderRadius:n,textColor3:r}=e,p="rgba(0, 0, 0, .14)";return Object.assign(Object.assign({},de),{iconColor:r,textColor:"white",loadingColor:d,opacityDisabled:f,railColor:p,railColorActive:d,buttonBoxShadow:"0 1px 4px 0 rgba(0, 0, 0, 0.3), inset 0 0 1px 0 rgba(0, 0, 0, 0.05)",buttonColor:"#FFF",railBorderRadiusSmall:n,railBorderRadiusMedium:n,railBorderRadiusLarge:n,buttonBorderRadiusSmall:n,buttonBorderRadiusMedium:n,buttonBorderRadiusLarge:n,boxShadowFocus:`0 0 0 2px ${ce(d,{alpha:.2})}`})},ye={name:"Switch",common:se,self:pe},xe=ye,ke=O("switch",`
 height: var(--n-height);
 min-width: var(--n-width);
 vertical-align: middle;
 user-select: none;
 -webkit-user-select: none;
 display: inline-flex;
 outline: none;
 justify-content: center;
 align-items: center;
`,[t("children-placeholder",`
 height: var(--n-rail-height);
 display: flex;
 flex-direction: column;
 overflow: hidden;
 pointer-events: none;
 visibility: hidden;
 `),t("rail-placeholder",`
 display: flex;
 flex-wrap: none;
 `),t("button-placeholder",`
 width: calc(1.75 * var(--n-rail-height));
 height: var(--n-rail-height);
 `),O("base-loading",`
 position: absolute;
 top: 50%;
 left: 50%;
 transform: translateX(-50%) translateY(-50%);
 font-size: calc(var(--n-button-width) - 4px);
 color: var(--n-loading-color);
 transition: color .3s var(--n-bezier);
 `,[A({left:"50%",top:"50%",originalTransform:"translateX(-50%) translateY(-50%)"})]),t("checked, unchecked",`
 transition: color .3s var(--n-bezier);
 color: var(--n-text-color);
 box-sizing: border-box;
 position: absolute;
 white-space: nowrap;
 top: 0;
 bottom: 0;
 display: flex;
 align-items: center;
 line-height: 1;
 `),t("checked",`
 right: 0;
 padding-right: calc(1.25 * var(--n-rail-height) - var(--n-offset));
 `),t("unchecked",`
 left: 0;
 justify-content: flex-end;
 padding-left: calc(1.25 * var(--n-rail-height) - var(--n-offset));
 `),N("&:focus",[t("rail",`
 box-shadow: var(--n-box-shadow-focus);
 `)]),l("round",[t("rail","border-radius: calc(var(--n-rail-height) / 2);",[t("button","border-radius: calc(var(--n-button-height) / 2);")])]),H("disabled",[H("icon",[l("rubber-band",[l("pressed",[t("rail",[t("button","max-width: var(--n-button-width-pressed);")])]),t("rail",[N("&:active",[t("button","max-width: var(--n-button-width-pressed);")])]),l("active",[l("pressed",[t("rail",[t("button","left: calc(100% - var(--n-offset) - var(--n-button-width-pressed));")])]),t("rail",[N("&:active",[t("button","left: calc(100% - var(--n-offset) - var(--n-button-width-pressed));")])])])])])]),l("active",[t("rail",[t("button","left: calc(100% - var(--n-button-width) - var(--n-offset))")])]),t("rail",`
 overflow: hidden;
 height: var(--n-rail-height);
 min-width: var(--n-rail-width);
 border-radius: var(--n-rail-border-radius);
 cursor: pointer;
 position: relative;
 transition:
 opacity .3s var(--n-bezier),
 background .3s var(--n-bezier),
 box-shadow .3s var(--n-bezier);
 background-color: var(--n-rail-color);
 `,[t("button-icon",`
 color: var(--n-icon-color);
 transition: color .3s var(--n-bezier);
 font-size: calc(var(--n-button-height) - 4px);
 position: absolute;
 left: 0;
 right: 0;
 top: 0;
 bottom: 0;
 display: flex;
 justify-content: center;
 align-items: center;
 line-height: 1;
 `,[A()]),t("button",`
 align-items: center; 
 top: var(--n-offset);
 left: var(--n-offset);
 height: var(--n-button-height);
 width: var(--n-button-width-pressed);
 max-width: var(--n-button-width);
 border-radius: var(--n-button-border-radius);
 background-color: var(--n-button-color);
 box-shadow: var(--n-button-box-shadow);
 box-sizing: border-box;
 cursor: inherit;
 content: "";
 position: absolute;
 transition:
 background-color .3s var(--n-bezier),
 left .3s var(--n-bezier),
 opacity .3s var(--n-bezier),
 max-width .3s var(--n-bezier),
 box-shadow .3s var(--n-bezier);
 `)]),l("active",[t("rail","background-color: var(--n-rail-color-active);")]),l("loading",[t("rail",`
 cursor: wait;
 `)]),l("disabled",[t("rail",`
 cursor: not-allowed;
 opacity: .5;
 `)])]),Ce=Object.assign(Object.assign({},I.props),{size:{type:String,default:"medium"},value:{type:[String,Number,Boolean],default:void 0},loading:Boolean,defaultValue:{type:[String,Number,Boolean],default:!1},disabled:{type:Boolean,default:void 0},round:{type:Boolean,default:!0},"onUpdate:value":[Function,Array],onUpdateValue:[Function,Array],checkedValue:{type:[String,Number,Boolean],default:!0},uncheckedValue:{type:[String,Number,Boolean],default:!1},railStyle:Function,rubberBand:{type:Boolean,default:!0},onChange:[Function,Array]});let R;const Ve=ue({name:"Switch",props:Ce,setup(e){R===void 0&&(typeof CSS<"u"?typeof CSS.supports<"u"?R=CSS.supports("width","max(1px)"):R=!1:R=!0);const{mergedClsPrefixRef:d,inlineThemeDisabled:f}=he(e),n=I("Switch","-switch",ke,xe,e,d),r=me(e),{mergedSizeRef:p,mergedDisabledRef:g}=r,k=W(e.defaultValue),B=be(e,"value"),v=we(B,k),C=z(()=>v.value===e.checkedValue),y=W(!1),i=W(!1),c=z(()=>{const{railStyle:o}=e;if(o)return o({focused:i.value,checked:C.value})});function u(o){const{"onUpdate:value":$,onChange:_,onUpdateValue:V}=e,{nTriggerFormInput:F,nTriggerFormChange:T}=r;$&&L($,o),V&&L(V,o),_&&L(_,o),k.value=o,F(),T()}function E(){const{nTriggerFormFocus:o}=r;o()}function X(){const{nTriggerFormBlur:o}=r;o()}function Y(){e.loading||g.value||(v.value!==e.checkedValue?u(e.checkedValue):u(e.uncheckedValue))}function J(){i.value=!0,E()}function Q(){i.value=!1,X(),y.value=!1}function q(o){e.loading||g.value||o.key===" "&&(v.value!==e.checkedValue?u(e.checkedValue):u(e.uncheckedValue),y.value=!1)}function G(o){e.loading||g.value||o.key===" "&&(o.preventDefault(),y.value=!0)}const U=z(()=>{const{value:o}=p,{self:{opacityDisabled:$,railColor:_,railColorActive:V,buttonBoxShadow:F,buttonColor:T,boxShadowFocus:Z,loadingColor:ee,textColor:te,iconColor:oe,[m("buttonHeight",o)]:h,[m("buttonWidth",o)]:ie,[m("buttonWidthPressed",o)]:ae,[m("railHeight",o)]:b,[m("railWidth",o)]:S,[m("railBorderRadius",o)]:ne,[m("buttonBorderRadius",o)]:re},common:{cubicBezierEaseInOut:le}}=n.value;let M,P,D;return R?(M=`calc((${b} - ${h}) / 2)`,P=`max(${b}, ${h})`,D=`max(${S}, calc(${S} + ${h} - ${b}))`):(M=j((s(b)-s(h))/2),P=j(Math.max(s(b),s(h))),D=s(b)>s(h)?S:j(s(S)+s(h)-s(b))),{"--n-bezier":le,"--n-button-border-radius":re,"--n-button-box-shadow":F,"--n-button-color":T,"--n-button-width":ie,"--n-button-width-pressed":ae,"--n-button-height":h,"--n-height":P,"--n-offset":M,"--n-opacity-disabled":$,"--n-rail-border-radius":ne,"--n-rail-color":_,"--n-rail-color-active":V,"--n-rail-height":b,"--n-rail-width":S,"--n-width":D,"--n-box-shadow-focus":Z,"--n-loading-color":ee,"--n-text-color":te,"--n-icon-color":oe}}),x=f?fe("switch",z(()=>p.value[0]),U,e):void 0;return{handleClick:Y,handleBlur:Q,handleFocus:J,handleKeyup:q,handleKeydown:G,mergedRailStyle:c,pressed:y,mergedClsPrefix:d,mergedValue:v,checked:C,mergedDisabled:g,cssVars:f?void 0:U,themeClass:x?.themeClass,onRender:x?.onRender}},render(){const{mergedClsPrefix:e,mergedDisabled:d,checked:f,mergedRailStyle:n,onRender:r,$slots:p}=this;r?.();const{checked:g,unchecked:k,icon:B,"checked-icon":v,"unchecked-icon":C}=p,y=!(K(B)&&K(v)&&K(C));return a("div",{role:"switch","aria-checked":f,class:[`${e}-switch`,this.themeClass,y&&`${e}-switch--icon`,f&&`${e}-switch--active`,d&&`${e}-switch--disabled`,this.round&&`${e}-switch--round`,this.loading&&`${e}-switch--loading`,this.pressed&&`${e}-switch--pressed`,this.rubberBand&&`${e}-switch--rubber-band`],tabindex:this.mergedDisabled?void 0:0,style:this.cssVars,onClick:this.handleClick,onFocus:this.handleFocus,onBlur:this.handleBlur,onKeyup:this.handleKeyup,onKeydown:this.handleKeydown},a("div",{class:`${e}-switch__rail`,"aria-hidden":"true",style:n},w(g,i=>w(k,c=>i||c?a("div",{"aria-hidden":!0,class:`${e}-switch__children-placeholder`},a("div",{class:`${e}-switch__rail-placeholder`},a("div",{class:`${e}-switch__button-placeholder`}),i),a("div",{class:`${e}-switch__rail-placeholder`},a("div",{class:`${e}-switch__button-placeholder`}),c)):null)),a("div",{class:`${e}-switch__button`},w(B,i=>w(v,c=>w(C,u=>a(ge,null,{default:()=>this.loading?a(ve,{key:"loading",clsPrefix:e,strokeWidth:20}):this.checked&&(c||i)?a("div",{class:`${e}-switch__button-icon`,key:c?"checked-icon":"icon"},c||i):!this.checked&&(u||i)?a("div",{class:`${e}-switch__button-icon`,key:u?"unchecked-icon":"icon"},u||i):null})))),w(g,i=>i&&a("div",{key:"checked",class:`${e}-switch__checked`},i)),w(k,i=>i&&a("div",{key:"unchecked",class:`${e}-switch__unchecked`},i)))))}});export{Ve as _};
