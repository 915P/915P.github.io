import{o,f as s,a2 as r,d as l,a3 as i,k as a,m,E as p}from"./index-6b7fa7ee.js";import{u as d}from"./use-theme-vars-c3d821c3.js";const g={class:"markdown-body"},h=r(`<h2>Configuration</h2><p>Set the global config</p><pre><code class="language-shell">git config --global user.name &quot;[name]&quot;
git config --global user.email &quot;[email]&quot;
</code></pre><h2>Get started</h2><p>Create a git repository</p><pre><code class="language-shell">git init
</code></pre><p>Clone an existing git repository</p><pre><code class="language-shell">git clone [url]
</code></pre><h2>Commit</h2><p>Commit all tracked changes</p><pre><code class="language-shell">git commit -am &quot;[commit message]&quot;
</code></pre><p>Add new modifications to the last commit</p><pre><code class="language-shell">git commit --amend --no-edit
</code></pre><h2>I’ve made a mistake</h2><p>Change last commit message</p><pre><code class="language-shell">git commit --amend
</code></pre><p>Undo most recent commit and keep changes</p><pre><code class="language-shell">git reset HEAD~1
</code></pre><p>Undo the <code>N</code> most recent commit and keep changes</p><pre><code class="language-shell">git reset HEAD~N
</code></pre><p>Undo most recent commit and get rid of changes</p><pre><code class="language-shell">git reset HEAD~1 --hard
</code></pre><p>Reset branch to remote state</p><pre><code class="language-shell">git fetch origin
git reset --hard origin/[branch-name]
</code></pre><h2>Miscellaneous</h2><p>Renaming the local master branch to main</p><pre><code class="language-shell">git branch -m master main
</code></pre>`,27),u=[h],_={__name:"git-memo.content",setup(c,{expose:e}){return e({frontmatter:{}}),(n,b)=>(o(),s("div",g,u))}},f=l({__name:"git-memo",setup(c){i(t=>({"8cb22b3c":a(e).cardColor}));const e=d();return(t,n)=>(o(),s("div",null,[m(a(_))]))}});const x=p(f,[["__scopeId","data-v-c7dbeca3"]]);export{x as default};
