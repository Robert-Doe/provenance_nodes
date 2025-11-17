parents_summary.filter(obj=>obj.repeating_groups.length>0).map(yArray=>yArray.repeating_groups).filter(xArray=>{
    let hasTargetArray=xArray.filter(pObject=>pObject.block_xpath_template.startsWith('/html[1]/body[1]/ytd-app[1]/div[1]/ytd-page-manager[1]/ytd-watch-flexy[1]/div[5]/div[1]/div[1]/div[2]/ytd-comments[1]/ytd-item-section-renderer[1]/div[3]'))
    return hasTargetArray.length>0;
})

let mapArrays= Array.from(prunedI.entries())

mapArrays.filter(item=>item[0].includes('ytd-comment-thread-renderer'));